import { z } from "zod";

export const RcsTemplateCreateSchema = z.object({
  template_id: z.string().min(1).max(120),
  sender: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
});
export type RcsTemplateCreateInput = z.infer<typeof RcsTemplateCreateSchema>;

export const RcsCampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  template_id: z.string().min(1).max(120),
  params: z.record(z.string(), z.string().max(1000)).optional(),
});
export type RcsCampaignCreateInput = z.infer<typeof RcsCampaignCreateSchema>;
