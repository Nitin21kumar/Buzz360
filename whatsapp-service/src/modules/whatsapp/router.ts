import { Router } from "express";
import multer from "multer";

import { asyncHandler, ValidationError } from "../../core/errors";
import { sendLimiter, webhookLimiter } from "../../core/rateLimit";
import { secureCompare } from "../../core/secureCompare";
import { requireAuth, requirePermission } from "../../auth/middleware";
import { config } from "../../core/config";
import * as service from "./service";
import { CampaignCreateSchema, TemplateCreateSchema } from "./schemas";

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

export const whatsappRouter = Router();

whatsappRouter.get(
  "/readiness",
  requireAuth,
  requirePermission("whatsapp", "view"),
  asyncHandler(async (_req, res) => res.json(await service.readiness()))
);

whatsappRouter.get(
  "/templates",
  requireAuth,
  requirePermission("whatsapp", "view"),
  asyncHandler(async (_req, res) => res.json(await service.listTemplates()))
);

whatsappRouter.post(
  "/templates",
  requireAuth,
  requirePermission("whatsapp", "templates_manage"),
  asyncHandler(async (req, res) => {
    const input = TemplateCreateSchema.parse(req.body);
    res.json(await service.createTemplate(req.user!, input));
  })
);

whatsappRouter.delete(
  "/templates/:id",
  requireAuth,
  requirePermission("whatsapp", "templates_manage"),
  asyncHandler(async (req, res) => {
    await service.deleteTemplate(req.params.id);
    res.json({ message: "Template removed" });
  })
);

whatsappRouter.post(
  "/campaigns",
  requireAuth,
  requirePermission("whatsapp", "create"),
  asyncHandler(async (req, res) => {
    const input = CampaignCreateSchema.parse(req.body);
    res.json(await service.createCampaign(req.user!, input));
  })
);

whatsappRouter.get(
  "/campaigns",
  requireAuth,
  requirePermission("whatsapp", "view"),
  asyncHandler(async (req, res) => res.json(await service.listCampaigns(req.user!)))
);

whatsappRouter.get(
  "/campaigns/:id",
  requireAuth,
  requirePermission("whatsapp", "view"),
  asyncHandler(async (req, res) => res.json(await service.getCampaignDetail(req.user!, req.params.id)))
);

whatsappRouter.post(
  "/campaigns/:id/upload-contacts",
  requireAuth,
  requirePermission("whatsapp", "edit"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("No file uploaded");
    const result = await service.uploadContacts(req.user!, req.params.id, req.file.originalname, req.file.buffer);
    res.json(result);
  })
);

whatsappRouter.delete(
  "/campaigns/:id/contacts",
  requireAuth,
  requirePermission("whatsapp", "edit"),
  asyncHandler(async (req, res) => res.json(await service.deleteContacts(req.user!, req.params.id)))
);

whatsappRouter.post(
  "/campaigns/:id/start",
  requireAuth,
  requirePermission("whatsapp", "trigger"),
  sendLimiter,
  asyncHandler(async (req, res) => res.json(await service.startCampaign(req.user!, req.params.id)))
);

whatsappRouter.post(
  "/campaigns/:id/stop",
  requireAuth,
  requirePermission("whatsapp", "trigger"),
  asyncHandler(async (req, res) => res.json(await service.stopCampaign(req.user!, req.params.id)))
);

whatsappRouter.delete(
  "/campaigns/:id",
  requireAuth,
  requirePermission("whatsapp", "delete"),
  asyncHandler(async (req, res) => res.json(await service.deleteCampaign(req.user!, req.params.id)))
);

const handleStatusWebhookRequest = asyncHandler(async (req, res) => {
  const providedKey = String(req.get("x-webhook-secret") || req.query.key || "");
  if (!config.statusWebhookSecret || !secureCompare(providedKey, config.statusWebhookSecret)) {
    res.status(403).json({ detail: "Invalid or missing webhook secret" });
    return;
  }
  const merged: Record<string, unknown> = { ...req.query, ...(req.body || {}) };
  delete merged.key;
  res.json(await service.handleStatusWebhook(merged as Record<string, string | undefined>));
});

whatsappRouter.get("/webhooks/status", webhookLimiter, handleStatusWebhookRequest);
whatsappRouter.post("/webhooks/status", webhookLimiter, handleStatusWebhookRequest);
