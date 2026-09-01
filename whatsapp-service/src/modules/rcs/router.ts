import { Router } from "express";
import multer from "multer";

import { asyncHandler, ValidationError } from "../../core/errors";
import { sendLimiter, webhookLimiter } from "../../core/rateLimit";
import { secureCompare } from "../../core/secureCompare";
import { requireAuth, requirePermission } from "../../auth/middleware";
import { config } from "../../core/config";
import * as service from "./service";
import { RcsCampaignCreateSchema, RcsTemplateCreateSchema } from "./schemas";

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

export const rcsRouter = Router();

rcsRouter.get(
  "/templates",
  requireAuth,
  requirePermission("rcs", "view"),
  asyncHandler(async (_req, res) => res.json(await service.listTemplates()))
);

rcsRouter.post(
  "/templates",
  requireAuth,
  requirePermission("rcs", "templates_manage"),
  asyncHandler(async (req, res) => {
    const input = RcsTemplateCreateSchema.parse(req.body);
    res.json(await service.createTemplate(req.user!, input));
  })
);

rcsRouter.delete(
  "/templates/:id",
  requireAuth,
  requirePermission("rcs", "templates_manage"),
  asyncHandler(async (req, res) => {
    await service.deleteTemplate(req.params.id);
    res.json({ message: "Template removed" });
  })
);

rcsRouter.post(
  "/campaigns",
  requireAuth,
  requirePermission("rcs", "create"),
  asyncHandler(async (req, res) => {
    const input = RcsCampaignCreateSchema.parse(req.body);
    res.json(await service.createCampaign(req.user!, input));
  })
);

rcsRouter.get(
  "/campaigns",
  requireAuth,
  requirePermission("rcs", "view"),
  asyncHandler(async (req, res) => res.json(await service.listCampaigns(req.user!)))
);

rcsRouter.get(
  "/campaigns/:id",
  requireAuth,
  requirePermission("rcs", "view"),
  asyncHandler(async (req, res) => res.json(await service.getCampaignDetail(req.user!, req.params.id)))
);

rcsRouter.post(
  "/campaigns/:id/upload-contacts",
  requireAuth,
  requirePermission("rcs", "edit"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("No file uploaded");
    res.json(await service.uploadContacts(req.user!, req.params.id, req.file.originalname, req.file.buffer));
  })
);

rcsRouter.delete(
  "/campaigns/:id/contacts",
  requireAuth,
  requirePermission("rcs", "edit"),
  asyncHandler(async (req, res) => res.json(await service.deleteContacts(req.user!, req.params.id)))
);

rcsRouter.post(
  "/campaigns/:id/start",
  requireAuth,
  requirePermission("rcs", "trigger"),
  sendLimiter,
  asyncHandler(async (req, res) => res.json(await service.startCampaign(req.user!, req.params.id)))
);

rcsRouter.post(
  "/campaigns/:id/stop",
  requireAuth,
  requirePermission("rcs", "trigger"),
  asyncHandler(async (req, res) => res.json(await service.stopCampaign(req.user!, req.params.id)))
);

rcsRouter.delete(
  "/campaigns/:id",
  requireAuth,
  requirePermission("rcs", "delete"),
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

rcsRouter.get("/webhooks/status", webhookLimiter, handleStatusWebhookRequest);
rcsRouter.post("/webhooks/status", webhookLimiter, handleStatusWebhookRequest);
