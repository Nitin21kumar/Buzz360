import { isValidObjectId } from "../../db/objectId";
import {
  rcsCampaignsCollection,
  rcsContactsCollection,
  rcsTemplatesCollection,
  CampaignStatus,
  RcsCampaignDoc,
  RcsContactDoc,
  RcsTemplateDoc,
} from "../../db/collections";
import { ValidationError } from "../../core/errors";

export function assertValidId(id: string, label = "id"): string {
  if (!isValidObjectId(id)) throw new ValidationError(`Invalid ${label}`);
  return id;
}

export const templates = {
  list: () => rcsTemplatesCollection.find({}),
  findByTemplateId: (templateId: string) => rcsTemplatesCollection.findOne({ template_id: templateId }),
  create: (doc: RcsTemplateDoc) => rcsTemplatesCollection.insertOne(doc),
  delete: (id: string) => rcsTemplatesCollection.deleteOne({ _id: id }),
};

export const campaigns = {
  create: (doc: RcsCampaignDoc) => rcsCampaignsCollection.insertOne(doc),
  find: (id: string) => rcsCampaignsCollection.findOne({ _id: id }),
  list: (ownerQuery: Record<string, unknown>) => rcsCampaignsCollection.find(ownerQuery),
  listByStatus: (status: CampaignStatus) => rcsCampaignsCollection.find({ status }),
  update: (id: string, updates: Partial<RcsCampaignDoc>) => rcsCampaignsCollection.updateOne({ _id: id }, { $set: updates }),
  transition: (id: string, from: CampaignStatus, patch: Partial<RcsCampaignDoc>) =>
    rcsCampaignsCollection.compareAndPatch(id, "status", from, patch as Record<string, unknown>),
  delete: (id: string) => rcsCampaignsCollection.deleteOne({ _id: id }),
};

export const contacts = {
  insertMany: (docs: RcsContactDoc[]) => rcsContactsCollection.insertMany(docs),
  listByCampaign: (campaignId: string) => rcsContactsCollection.find({ campaign_id: campaignId }),
  countByCampaign: (campaignId: string) => rcsContactsCollection.countDocuments({ campaign_id: campaignId }),
  retriableByCampaign: (campaignId: string) =>
    rcsContactsCollection.find({ campaign_id: campaignId, status: { $in: ["pending", "error"] } }),
  patchMany: (ids: string[], patch: Partial<RcsContactDoc>) =>
    rcsContactsCollection.patchMany(ids, patch as Record<string, unknown>),
  updateByLogId: (logId: string, mobile: string | null, patch: Partial<RcsContactDoc>) =>
    rcsContactsCollection.updateManyWhere(
      mobile ? { log_id: logId, phone_number: mobile } : { log_id: logId },
      patch as Record<string, unknown>
    ),
  updateByMobile: (mobile: string, campaignIds: string[], patch: Partial<RcsContactDoc>) =>
    rcsContactsCollection.updateManyWhere(
      campaignIds.length ? { phone_number: mobile, campaign_id: { $in: campaignIds } } : { phone_number: mobile },
      patch as Record<string, unknown>
    ),
  findOneForWebhook: (logId: string | null, mobile: string | null) => {
    if (logId && mobile) return rcsContactsCollection.findOne({ log_id: logId, phone_number: mobile });
    if (logId) return rcsContactsCollection.findOne({ log_id: logId });
    if (mobile) return rcsContactsCollection.findOne({ phone_number: mobile });
    return Promise.resolve(null);
  },
  staleSent: (campaignId: string) => rcsContactsCollection.find({ campaign_id: campaignId, status: "sent" }),
  deleteByCampaign: (campaignId: string) => rcsContactsCollection.deleteMany({ campaign_id: campaignId }),
};
