# WhatsApp + RCS Service (Node.js / TypeScript)

Standalone service for sending WhatsApp and RCS broadcasts via Sarv's
APIs (waba.sarv.com) — `/api/whatsapp/*` uses the WABA API, `/api/rcs/*`
uses the Bulk RCS API. This is the first pair of modules pulled out of
the FastAPI backend as part of a gradual migration to Node.js — see the
root `docker-compose.yml` / `gateway/nginx.conf` for how it's wired in.

## What this replaces

The old WhatsApp module (Meta Cloud API based: inbox, AI auto-reply,
keyword rules, human handoff) has been removed from the FastAPI backend.
Both modules here only do **outbound template broadcasts** — neither of
Sarv's docs mention an inbound-message webhook, only delivery-status
callbacks (Sarv's "Webhook Setup" dashboard panel), so Inbox/AI-reply are
gone for now. They can come back later as new modules here once/if a
customer-reply webhook spec is available.

## What it does

**WhatsApp (`src/modules/whatsapp/`):**
- Register WhatsApp template IDs (`wid`) you've already approved on
  waba.sarv.com (Sarv has no "list templates" API, so this is a small
  manual registry — just wid + a friendly name + type).
- Create a campaign against one registered template, upload a contact
  list (CSV/XLSX, needs a phone-number column), and start the broadcast.
  Every recipient in a campaign gets the identical message (no
  per-contact variables — confirmed scope).
- Batches sends in groups of up to 200 recipients per request (Sarv's
  documented cap for `requestjson.php`).
- Per-recipient delivery state: `pending → sent → delivered → read`, or
  `failed` (Sarv rejected it / negative DLR), or `error` (our send call
  couldn't confirm an outcome — retried automatically on the next run and
  on service restart). Sarv's per-recipient response is parsed so a
  partial failure inside an accepted batch is recorded correctly.
- The delivery-status webhook matches callbacks on a normalized mobile
  (+ log id) and updates **every** matching contact; a late/out-of-order
  callback never downgrades a contact that already reached a later state.
- `draft → running` is an atomic DB transition (two concurrent "start"s
  can't both broadcast). A broadcast can be **stopped** mid-run, and one
  interrupted by a crash/restart resumes automatically from where it
  stopped. A `running` campaign can't be deleted.
- Uploads are capped at `MAX_CONTACTS_PER_CAMPAIGN` (default 50 000) and
  report how many rows were added / already present / duplicated /
  invalid / blank.

**RCS (`src/modules/rcs/`):**
- Same shape as WhatsApp above, but templates need both a `template_id`
  and a `sender` (Bot ID), and campaigns can carry a fixed set of
  key/value template params (e.g. `name`, `company`) applied identically
  to every recipient.
- Batches in groups of 100 by default (`SARV_RCS_MAX_RECIPIENTS_PER_REQUEST`
  — Sarv's Bulk RCS doc doesn't state a cap, so this is a conservative
  default, not a documented limit).
- Sarv's Bulk RCS also supports multi-channel fallback
  (`fallback_condition`, e.g. RCS → WhatsApp → SMS) — intentionally not
  wired up yet; see "Known limitations" below.


## Data model

Shares the **same Postgres database** as the FastAPI backend, via the
same generic `app_documents` JSONB table. `src/db/documentStore.ts` is a
TypeScript twin of the Python backend's `app/db/postgres_store.py` — same
encoding for ids/dates — so:
- This service reads (and can bootstrap-write) the `users` collection to
  authenticate/authorize people, exactly like the Python backend does.
- This service owns `whatsapp_campaigns`, `whatsapp_contacts`, and
  `whatsapp_templates` — the Python backend no longer touches them.

If you ever add a query operator to one store's `_match`/`matches`
function, add it to the other too (see the comment at the top of each).

## Setup

```bash
cd whatsapp-service
cp .env.example .env
# fill in DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_PATH, SARV_WABA_AUTHKEY,
# WHATSAPP_STATUS_WEBHOOK_SECRET
npm install
npm run dev        # local dev, auto-reloads
# or:
npm run build && npm start
```

With Docker (recommended — this is already wired into the root
`docker-compose.yml` alongside `gateway/`, which routes `/api/whatsapp/*`
here and everything else to the FastAPI backend):

```bash
docker compose up --build
```

## Registering Sarv's status webhook

In waba.sarv.com's **Webhook Setup** panel, register it once per channel
(same secret works for both — set `WHATSAPP_STATUS_WEBHOOK_SECRET` once):
- **WhatsApp** — Channel: WhatsApp, URL: `https://<your-domain>/api/whatsapp/webhooks/status?key=<SECRET>`
- **RCS** — Channel: RCS, URL: `https://<your-domain>/api/rcs/webhooks/status?key=<SECRET>`
- Method: POST (or GET — both are accepted) for either
- Parameters: Mobile, Status, Log ID (Email/Time are accepted but unused)

If Sarv's panel lets you set a custom request header instead, prefer
sending the secret as `X-Webhook-Secret: <SECRET>` (keeps it out of URL /
proxy access logs) — the route accepts either. The webhook's inbound
rate-limit ceiling is `WEBHOOK_RATE_LIMIT_PER_MIN` (default 6000/min) so a
large broadcast's per-recipient callbacks aren't dropped.

## Known limitations / next steps

- No "list templates" API from Sarv — the template registry here is
  manual. If Sarv adds one later, `sarvGateway.ts` is the place to wire it
  in and the Templates tab can switch from manual entry to a live list.
- No per-contact template variables yet (confirmed out of scope for this
  pass) — if needed later, `body_values` is already a free-form
  `Record<string, string>` on the campaign; extending it to vary per
  contact means reading extra CSV columns in `contactsParser.ts` and
  building `bodyValues` per recipient in `service.ts::runCampaign`
  instead of once for the whole batch.
- Rate limiting (`express-rate-limit`) is in-process — with more than one
  replica of this service behind the gateway, back it with Redis instead
  for a true global limit (same caveat as the FastAPI backend's slowapi
  setup).
- The resume-on-boot / stop / in-flight guards are per-process. Run **one**
  replica of this service, or a second replica could pick up the same
  interrupted campaign on its own startup (the atomic `draft → running`
  claim stops double-*starts*, but not two processes resuming the same
  already-`running` campaign). Multi-replica needs a shared lock
  (advisory lock / Redis) around `runCampaign`.
- Delivery reconciliation is one-directional (webhook push only). Sarv
  exposes no "fetch delivery report" API for these channels, so a contact
  that's `sent` but never gets a webhook is swept to `error` after
  `RECONCILE_STALE_SENT_AFTER_HOURS` rather than actively re-queried.
- `documentStore.ts` pushes simple equality / `$in` filters into SQL and
  `ensureSchema` adds partial indexes on the hot fields (campaign_id,
  log_id, phone_number, status), so per-batch status writes are single
  indexed `UPDATE`s. It's still a JSONB document store, not a relational
  schema — a collection in the tens of millions of rows would want real
  tables.
- Templates (wid/sender registry, both WhatsApp and RCS) are a shared,
  org-wide list gated by the `templates_manage` permission — not
  per-user. This mirrors how TTS voice folders work elsewhere in the app
  and is intentional, not an oversight; see the comment on
  `deleteTemplate` in each module's `service.ts` if this should ever
  become per-user instead.
- Cross-channel fallback (e.g. Voice → WhatsApp → RCS → SMS, in whatever
  order/combination) is planned but intentionally *not* built yet — it'll
  be configured manually per the team's own waterfall logic once that
  design is settled, not auto-wired through Sarv's built-in
  `fallback_condition` (RCS) mechanism.

## Security review notes (as of the WhatsApp+RCS+SMS pass)

- Every route except the two `/webhooks/status` endpoints requires a
  valid Firebase token (`requireAuth`) + an explicit permission grant
  (`requirePermission`) — verified programmatically across both routers.
- The status webhooks are gated by a shared-secret query param compared
  with `crypto.timingSafeEqual` (`core/secureCompare.ts`), not a plain
  `===`, so the secret can't be recovered via response-timing.
- Every campaign read/mutate goes through `getOwnedCampaign()`, which
  enforces `assertOwnsOrAdmin` — a non-admin can only see/touch their own
  campaigns, same pattern as the FastAPI backend's `campaigns`/`sms`
  modules.
- Zod validates and *strips* unrecognized fields from every request body
  before it reaches business logic — no raw `req.body` spreading into a
  DB document anywhere in either module.
- `MODULE_SERVICES` here mirrors `MODULE_CATALOG` in the FastAPI backend's
  `app/auth/permissions.py` — module keys **and** their service lists — so
  `defaultPermissionsForRole` produces the exact same profile as the
  Python `default_permissions_for_role` regardless of which service
  bootstraps a brand-new user. If you add a module/service in one, mirror
  it in the other.
