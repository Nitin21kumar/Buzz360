import { z } from "zod";

export const TemplateCreateSchema = z.object({
  wid: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  type: z.enum(["text", "media"]),
});
export type TemplateCreateInput = z.infer<typeof TemplateCreateSchema>;

export const CampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  template_wid: z.string().min(1).max(50),
  header_media_url: z.string().url().max(2000).optional(),
  body_values: z.record(z.string(), z.string().max(500)).optional(),
});
export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;
