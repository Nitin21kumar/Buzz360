import { Collection, ensureSchema } from "./documentStore";

export interface UserDoc {
  _id: string;
  uid: string;
  email: string;
  name: string;
  role: "super_admin" | "admin" | "user";
  modules: string[];
  services: string[];
  fields: string[];
  active: boolean;
  created_by: string;
  created_at: Date;
}

export interface WhatsappTemplateDoc {
  _id: string;
  wid: string;
  name: string;
  type: "text" | "media";
  created_by: string;
  created_at: Date;
}

export type CampaignStatus = "draft" | "running" | "stopped" | "completed" | "completed_with_errors";

export interface WhatsappCampaignDoc {
  _id: string;
  name: string;
  template_wid: string;
  template_name: string;
  status: CampaignStatus;
  created_by: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  header_media_url?: string;
  body_values?: Record<string, string>;
}

export type ContactStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "error";

export interface WhatsappContactDoc {
  _id: string;
  campaign_id: string;
  phone_number: string;
  status: ContactStatus;
  error?: string | null;
  log_id?: string | null;
  status_detail?: string | null;
  sent_at?: Date | null;
  updated_at?: Date | null;
}

export interface RcsTemplateDoc {
  _id: string;
  template_id: string;
  sender: string;
  name: string;
  created_by: string;
  created_at: Date;
}

export interface RcsCampaignDoc {
  _id: string;
  name: string;
  template_id: string;
  sender: string;
  template_name: string;
  params?: Record<string, string>;
  status: CampaignStatus;
  created_by: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

export interface RcsContactDoc {
  _id: string;
  campaign_id: string;
  phone_number: string;
  status: ContactStatus;
  error?: string | null;
  log_id?: string | null;
  status_detail?: string | null;
  sent_at?: Date | null;
  updated_at?: Date | null;
}

export const usersCollection = new Collection<UserDoc>("users");
export const whatsappTemplatesCollection = new Collection<WhatsappTemplateDoc>("whatsapp_templates");
export const whatsappCampaignsCollection = new Collection<WhatsappCampaignDoc>("whatsapp_campaigns");
export const whatsappContactsCollection = new Collection<WhatsappContactDoc>("whatsapp_contacts");

export const rcsTemplatesCollection = new Collection<RcsTemplateDoc>("rcs_templates");
export const rcsCampaignsCollection = new Collection<RcsCampaignDoc>("rcs_campaigns");
export const rcsContactsCollection = new Collection<RcsContactDoc>("rcs_contacts");

export async function ensureIndexes(): Promise<void> {
  await ensureSchema();
}
