import { isValidObjectId } from "../../db/objectId";
import {
  whatsappCampaignsCollection,
  whatsappContactsCollection,
  whatsappTemplatesCollection,
  CampaignStatus,
  WhatsappCampaignDoc,
  WhatsappContactDoc,
  WhatsappTemplateDoc,
} from "../../db/collections";
import { ValidationError } from "../../core/errors";

export function assertValidId(id: string, label = "id"): string {
  if (!isValidObjectId(id)) throw new ValidationError(`Invalid ${label}`);
  return id;
}

export const templates = {
  list: () => whatsappTemplatesCollection.find({}),
  findByWid: (wid: string) => whatsappTemplatesCollection.findOne({ wid }),
  create: (doc: WhatsappTemplateDoc) => whatsappTemplatesCollection.insertOne(doc),
  delete: (id: string) => whatsappTemplatesCollection.deleteOne({ _id: id }),
};

export const campaigns = {
  create: (doc: WhatsappCampaignDoc) => whatsappCampaignsCollection.insertOne(doc),
  find: (id: string) => whatsappCampaignsCollection.findOne({ _id: id }),
  list: (ownerQuery: Record<string, unknown>) => whatsappCampaignsCollection.find(ownerQuery),
  listByStatus: (status: CampaignStatus) => whatsappCampaignsCollection.find({ status }),
  update: (id: string, updates: Partial<WhatsappCampaignDoc>) =>
    whatsappCampaignsCollection.updateOne({ _id: id }, { $set: updates }),
  transition: (id: string, from: CampaignStatus, patch: Partial<WhatsappCampaignDoc>) =>
    whatsappCampaignsCollection.compareAndPatch(id, "status", from, patch as Record<string, unknown>),
  delete: (id: string) => whatsappCampaignsCollection.deleteOne({ _id: id }),
};

export const contacts = {
  insertMany: (docs: WhatsappContactDoc[]) => whatsappContactsCollection.insertMany(docs),
  listByCampaign: (campaignId: string) => whatsappContactsCollection.find({ campaign_id: campaignId }),
  countByCampaign: (campaignId: string) => whatsappContactsCollection.countDocuments({ campaign_id: campaignId }),
  retriableByCampaign: (campaignId: string) =>
    whatsappContactsCollection.find({ campaign_id: campaignId, status: { $in: ["pending", "error"] } }),
  patchMany: (ids: string[], patch: Partial<WhatsappContactDoc>) =>
    whatsappContactsCollection.patchMany(ids, patch as Record<string, unknown>),
  updateByLogId: (logId: string, mobile: string | null, patch: Partial<WhatsappContactDoc>) =>
    whatsappContactsCollection.updateManyWhere(
      mobile ? { log_id: logId, phone_number: mobile } : { log_id: logId },
      patch as Record<string, unknown>
    ),
  updateByMobile: (mobile: string, campaignIds: string[], patch: Partial<WhatsappContactDoc>) =>
    whatsappContactsCollection.updateManyWhere(
      campaignIds.length ? { phone_number: mobile, campaign_id: { $in: campaignIds } } : { phone_number: mobile },
      patch as Record<string, unknown>
    ),
  findOneForWebhook: (logId: string | null, mobile: string | null) => {
    if (logId && mobile) return whatsappContactsCollection.findOne({ log_id: logId, phone_number: mobile });
    if (logId) return whatsappContactsCollection.findOne({ log_id: logId });
    if (mobile) return whatsappContactsCollection.findOne({ phone_number: mobile });
    return Promise.resolve(null);
  },
  staleSent: (campaignId: string) =>
    whatsappContactsCollection.find({ campaign_id: campaignId, status: "sent" }),
  deleteByCampaign: (campaignId: string) => whatsappContactsCollection.deleteMany({ campaign_id: campaignId }),
};
