import { logger } from "../../core/logger";
import { config } from "../../core/config";
import { UpstreamServiceError, ValidationError } from "../../core/errors";
import { AuthedUser, assertOwnsOrAdmin, ownerFilter } from "../../auth/permissions";
import { newObjectId } from "../../db/objectId";
import { WhatsappCampaignDoc, WhatsappContactDoc, WhatsappTemplateDoc } from "../../db/collections";
import { extractPhoneNumbers } from "./contactsParser";
import * as repository from "./repository";
import { CampaignCreateInput, TemplateCreateInput } from "./schemas";
import {
  getBalance,
  mapDeliveryStatus,
  normalizeMobile,
  normalizeWebhookMobile,
  sendTemplateBatch,
  STATUS_RANK,
  WabaRecipient,
} from "./sarvGateway";

const BATCH_SIZE_DELAY_MS = 800;
const WABA_BATCH = 200;

const inFlight = new Set<string>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function serializeTemplate(doc: WhatsappTemplateDoc) {
  return { id: doc._id, wid: doc.wid, name: doc.name, type: doc.type, created_at: doc.created_at };
}

export async function listTemplates() {
  const docs = await repository.templates.list();
  return docs.map(serializeTemplate);
}

export async function createTemplate(user: AuthedUser, input: TemplateCreateInput) {
  const existing = await repository.templates.findByWid(input.wid);
  if (existing) throw new ValidationError(`Template id ${input.wid} is already registered as "${existing.name}"`);

  const doc: WhatsappTemplateDoc = {
    _id: newObjectId(),
    wid: input.wid.trim(),
    name: input.name.trim(),
    type: input.type,
    created_by: user.uid,
    created_at: new Date(),
  };
  await repository.templates.create(doc);
  return serializeTemplate(doc);
}

export async function deleteTemplate(id: string) {
  await repository.templates.delete(repository.assertValidId(id, "template id"));
}


function tallyContacts(contacts: WhatsappContactDoc[]) {
  const t = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, errored: 0 };
  for (const c of contacts) {
    if (c.status === "pending") t.pending += 1;
    else if (c.status === "sent") t.sent += 1;
    else if (c.status === "delivered") t.delivered += 1;
    else if (c.status === "read") t.read += 1;
    else if (c.status === "failed") t.failed += 1;
    else if (c.status === "error") t.errored += 1;
  }
  return t;
}

export function serializeCampaign(
  doc: WhatsappCampaignDoc,
  tally = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, errored: 0 },
  total = 0
) {
  return {
    id: doc._id,
    name: doc.name,
    template_wid: doc.template_wid,
    template_name: doc.template_name,
    status: doc.status,
    total,
    pending: tally.pending,
    sent: tally.sent,
    delivered: tally.delivered,
    read: tally.read,
    failed: tally.failed,
    errored: tally.errored,
    submitted: tally.sent + tally.delivered + tally.read,
    created_at: doc.created_at,
    started_at: doc.started_at ?? null,
    completed_at: doc.completed_at ?? null,
  };
}

async function withCounts(doc: WhatsappCampaignDoc) {
  const contacts = await repository.contacts.listByCampaign(doc._id);
  return serializeCampaign(doc, tallyContacts(contacts), contacts.length);
}

export async function createCampaign(user: AuthedUser, input: CampaignCreateInput) {
  const template = await repository.templates.findByWid(input.template_wid);
  if (!template) throw new ValidationError("Unknown template id — register it first under Templates.");
  if (template.type === "media" && !input.header_media_url) {
    throw new ValidationError("This template needs a media header — provide header_media_url.");
  }

  const doc: WhatsappCampaignDoc = {
    _id: newObjectId(),
    name: input.name.trim(),
    template_wid: template.wid,
    template_name: template.name,
    status: "draft",
    created_by: user.uid,
    created_at: new Date(),
    ...(input.header_media_url ? { header_media_url: input.header_media_url } : {}),
    ...(input.body_values ? { body_values: input.body_values } : {}),
  };
  await repository.campaigns.create(doc);
  return serializeCampaign(doc);
}

export async function listCampaigns(user: AuthedUser) {
  const docs = await repository.campaigns.list(ownerFilter(user));
  return Promise.all(docs.map(withCounts));
}

async function getOwnedCampaign(user: AuthedUser, campaignId: string) {
  const id = repository.assertValidId(campaignId, "campaign id");
  const doc = await repository.campaigns.find(id);
  assertOwnsOrAdmin(user, doc);
  return doc as WhatsappCampaignDoc;
}

export async function getCampaignDetail(user: AuthedUser, campaignId: string) {
  const doc = await getOwnedCampaign(user, campaignId);
  const contacts = await repository.contacts.listByCampaign(doc._id);
  return {
    ...serializeCampaign(doc, tallyContacts(contacts), contacts.length),
    contacts: contacts.map((c) => ({
      id: c._id,
      phone_number: c.phone_number,
      status: c.status,
      status_detail: c.status_detail ?? null,
      error: c.error ?? null,
    })),
  };
}

export async function uploadContacts(user: AuthedUser, campaignId: string, filename: string, buffer: Buffer) {
  const campaign = await getOwnedCampaign(user, campaignId);
  if (campaign.status !== "draft") throw new ValidationError("Recipients can only be added while the campaign is a draft");

  const parsed = await extractPhoneNumbers(filename, buffer);
  const existing = new Set((await repository.contacts.listByCampaign(campaign._id)).map((c) => c.phone_number));
  const existingCount = existing.size;

  let invalid = 0;
  let dupInFile = 0;
  let alreadyPresent = 0;
  const seen = new Set<string>();
  const toInsert: WhatsappContactDoc[] = [];

  for (const raw of parsed.numbers) {
    let mobile: string;
    try {
      mobile = normalizeMobile(raw);
    } catch {
      invalid += 1;
      continue;
    }
    if (seen.has(mobile)) {
      dupInFile += 1;
      continue;
    }
    seen.add(mobile);
    if (existing.has(mobile)) {
      alreadyPresent += 1;
      continue;
    }
    toInsert.push({ _id: newObjectId(), campaign_id: campaign._id, phone_number: mobile, status: "pending" });
  }

  if (existingCount + toInsert.length > config.maxContactsPerCampaign) {
    throw new ValidationError(
      `This campaign would exceed the ${config.maxContactsPerCampaign.toLocaleString()}-recipient limit ` +
        `(${existingCount.toLocaleString()} already + ${toInsert.length.toLocaleString()} new). ` +
        `Split it into multiple campaigns or raise MAX_CONTACTS_PER_CAMPAIGN.`
    );
  }

  const added = toInsert.length ? await repository.contacts.insertMany(toInsert) : 0;

  const parts = [`${added.toLocaleString()} recipient(s) added`];
  if (alreadyPresent) parts.push(`${alreadyPresent} already in this campaign`);
  if (dupInFile) parts.push(`${dupInFile} duplicate row(s) in the file`);
  if (invalid) parts.push(`${invalid} row(s) had an invalid phone number`);
  if (parsed.blankRows) parts.push(`${parsed.blankRows} blank row(s) skipped`);
  if (parsed.extraSheets) parts.push(`only the first worksheet was read (${parsed.extraSheets} more ignored)`);

  return {
    message: parts.join("; "),
    added,
    already_present: alreadyPresent,
    duplicates_in_file: dupInFile,
    invalid,
    blank_rows: parsed.blankRows,
    total: existingCount + added,
  };
}

export async function deleteContacts(user: AuthedUser, campaignId: string) {
  const campaign = await getOwnedCampaign(user, campaignId);
  if (campaign.status !== "draft") throw new ValidationError("Recipients can only be cleared while the campaign is a draft");
  const { deletedCount } = await repository.contacts.deleteByCampaign(campaign._id);
  return { message: `Deleted ${deletedCount} contact(s)` };
}

export async function deleteCampaign(user: AuthedUser, campaignId: string) {
  const campaign = await getOwnedCampaign(user, campaignId);
  if (campaign.status === "running") {
    throw new ValidationError("Stop this campaign before deleting it — a broadcast is in progress.");
  }
  await repository.contacts.deleteByCampaign(campaign._id);
  await repository.campaigns.delete(campaign._id);
  return { message: `Deleted campaign '${campaign.name}'` };
}


function nowPatch(extra: Partial<WhatsappContactDoc>): Partial<WhatsappContactDoc> {
  return { updated_at: new Date(), ...extra };
}

async function applySendResults(
  batch: { id: string; mobile: string }[],
  results: { mobile: string | null; messageId: string | null; status: string | null; accepted: boolean }[]
) {
  if (!results.length) {
    await repository.contacts.patchMany(
      batch.map((b) => b.id),
      nowPatch({ status: "sent", sent_at: new Date(), error: null })
    );
    return;
  }
  const byMobile = new Map(
    results
      .map((r) => [normalizeWebhookMobile(r.mobile), r] as const)
      .filter((entry): entry is readonly [string, (typeof results)[number]] => entry[0] !== null)
  );
  const acceptedNoDetail: string[] = [];
  for (const b of batch) {
    const r = byMobile.get(b.mobile);
    if (!r) {
      acceptedNoDetail.push(b.id);
      continue;
    }
    if (!r.accepted) {
      await repository.contacts.patchMany(
        [b.id],
        nowPatch({ status: "failed", status_detail: r.status, error: `Sarv rejected this number: ${r.status ?? "unknown"}` })
      );
    } else {
      await repository.contacts.patchMany(
        [b.id],
        nowPatch({ status: "sent", log_id: r.messageId ?? null, status_detail: r.status ?? null, sent_at: new Date(), error: null })
      );
    }
  }
  if (acceptedNoDetail.length) {
    await repository.contacts.patchMany(acceptedNoDetail, nowPatch({ status: "sent", sent_at: new Date(), error: null }));
  }
}

export async function runCampaign(campaignId: string): Promise<void> {
  if (inFlight.has(campaignId)) return;
  inFlight.add(campaignId);
  try {
    const campaign = await repository.campaigns.find(campaignId);
    if (!campaign || campaign.status !== "running") return;

    const pending = await repository.contacts.retriableByCampaign(campaignId);

    for (let i = 0; i < pending.length; i += WABA_BATCH) {
      const fresh = await repository.campaigns.find(campaignId);
      if (!fresh || fresh.status !== "running") {
        logger.info(`WhatsApp campaign ${campaignId} no longer running (${fresh?.status ?? "deleted"}) — halting`);
        return;
      }

      const slice = pending.slice(i, i + WABA_BATCH);
      const batch: { id: string; mobile: string }[] = [];
      const recipients: WabaRecipient[] = [];
      for (const c of slice) {
        let mobile: string;
        try {
          mobile = normalizeMobile(c.phone_number);
        } catch {
          await repository.contacts.patchMany([c._id], nowPatch({ status: "failed", error: `Unparseable number: ${c.phone_number}` }));
          continue;
        }
        batch.push({ id: c._id, mobile });
        recipients.push({
          mobile,
          ...(campaign.header_media_url ? { headerValues: { headerData: campaign.header_media_url } } : {}),
          ...(campaign.body_values ? { bodyValues: campaign.body_values } : {}),
        });
      }
      if (!recipients.length) continue;

      try {
        const result = await sendTemplateBatch(
          campaign.template_wid,
          campaign.header_media_url ? "media" : "text",
          recipients
        );
        logger.info(`Sarv WABA batch accepted for campaign ${campaignId} (${recipients.length} recipient(s))`);
        await applySendResults(batch, result.results);
      } catch (err) {
        const ambiguous = err instanceof UpstreamServiceError && err.ambiguous;
        const message = String((err as Error)?.message ?? err).slice(0, 300);
        logger.error(`Sarv WABA batch ${ambiguous ? "ambiguous" : "failed"} for campaign ${campaignId}`, message);
        await repository.contacts.patchMany(
          batch.map((b) => b.id),
          nowPatch({ status: ambiguous ? "error" : "failed", error: message })
        );
      }
      await sleep(BATCH_SIZE_DELAY_MS);
    }

    const finalContacts = await repository.contacts.listByCampaign(campaignId);
    const anyFailed = finalContacts.some((c) => c.status === "failed" || c.status === "error");
    await repository.campaigns.transition(campaignId, "running", {
      status: anyFailed ? "completed_with_errors" : "completed",
      completed_at: new Date(),
    });
  } finally {
    inFlight.delete(campaignId);
  }
}

export async function startCampaign(user: AuthedUser, campaignId: string): Promise<{ message: string }> {
  const campaign = await getOwnedCampaign(user, campaignId);

  const total = await repository.contacts.countByCampaign(campaign._id);
  if (!total) throw new ValidationError("Upload contacts first");

  const claimed = await repository.campaigns.transition(campaign._id, "draft", {
    status: "running",
    started_at: new Date(),
  });
  if (!claimed) throw new ValidationError("This campaign has already been started");

  runCampaign(campaign._id).catch((err) => logger.error(`Unhandled error running campaign ${campaign._id}`, err));
  return { message: `Campaign started — ${total} message(s) queued` };
}

export async function stopCampaign(user: AuthedUser, campaignId: string): Promise<{ message: string }> {
  const campaign = await getOwnedCampaign(user, campaignId);
  const stopped = await repository.campaigns.transition(campaign._id, "running", {
    status: "stopped",
    completed_at: new Date(),
  });
  if (!stopped) throw new ValidationError("Only a running campaign can be stopped");
  return { message: "Stopping — the current batch will finish, the remaining recipients are cancelled." };
}

export async function resumeInterruptedCampaigns(): Promise<void> {
  const running = await repository.campaigns.listByStatus("running");
  if (!running.length) return;
  logger.info(`Resuming ${running.length} interrupted WhatsApp campaign(s)`);
  for (const c of running) {
    runCampaign(c._id).catch((err) => logger.error(`Resume failed for WhatsApp campaign ${c._id}`, err));
  }
}

export async function sweepStaleSent(): Promise<void> {
  if (config.reconcileStaleSentAfterHours <= 0) return;
  const cutoff = Date.now() - config.reconcileStaleSentAfterHours * 3600_000;
  const done = [
    ...(await repository.campaigns.listByStatus("completed")),
    ...(await repository.campaigns.listByStatus("completed_with_errors")),
    ...(await repository.campaigns.listByStatus("stopped")),
  ];
  for (const c of done) {
    const finishedAt = (c.completed_at ? new Date(c.completed_at) : new Date(c.created_at)).getTime();
    if (finishedAt > cutoff) continue;
    const stale = await repository.contacts.staleSent(c._id);
    if (!stale.length) continue;
    await repository.contacts.patchMany(
      stale.map((s) => s._id),
      { status: "error", status_detail: "no delivery confirmation from Sarv", updated_at: new Date() }
    );
    logger.info(`Swept ${stale.length} unconfirmed 'sent' contact(s) in WhatsApp campaign ${c._id}`);
  }
}

export async function readiness() {
  try {
    const balance = await getBalance();
    return { configured: true, provider: "sarv_waba", balance };
  } catch (err: any) {
    return { configured: false, provider: "sarv_waba", detail: String(err?.message ?? err) };
  }
}

export async function handleStatusWebhook(params: Record<string, string | undefined>): Promise<{ ok: boolean }> {
  const rawMobile = params.mobile || params.Mobile || params.msisdn || params.number;
  const rawStatus = params.status || params.Status || "";
  const logId = params.logid || params.log_id || params["Log ID"] || params["LogID"] || params.id;
  const mobile = normalizeWebhookMobile(rawMobile);

  if (!mobile && !logId) {
    logger.warn("WhatsApp status webhook: no usable mobile/logid", { keys: Object.keys(params) });
    return { ok: false };
  }

  const { status: newStatus, rank } = mapDeliveryStatus(rawStatus);

  const current = await repository.contacts.findOneForWebhook(logId ?? null, mobile);
  if (current) {
    const terminal = current.status === "delivered" || current.status === "read" || current.status === "failed";
    if (terminal && rank <= STATUS_RANK[current.status]) {
      return { ok: true };
    }
  }

  const patch = {
    status: newStatus,
    status_detail: String(rawStatus) || null,
    updated_at: new Date(),
    ...(newStatus === "failed" ? { error: `Sarv delivery status: ${rawStatus}` } : {}),
  };

  let changed = 0;
  if (logId) {
    changed = await repository.contacts.updateByLogId(logId, mobile, patch);
  }
  if (!changed && mobile) {
    changed = await repository.contacts.updateByMobile(mobile, [], patch);
  }
  if (!changed) {
    logger.warn("WhatsApp status webhook matched no contact", { mobile, logId });
    return { ok: false };
  }
  return { ok: true };
}
