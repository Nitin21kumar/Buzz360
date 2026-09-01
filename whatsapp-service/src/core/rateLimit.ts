import rateLimit from "express-rate-limit";
import { Request } from "express";

import { config } from "./config";

function keyFor(req: Request): string {
  const uid = (req as any).user?.uid as string | undefined;
  return uid || req.ip || "unknown";
}

export function makeLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    skip: () => !config.rateLimitEnabled,
    message: { detail: "Too many requests — please slow down and try again shortly." },
  });
}

export const sendLimiter = makeLimiter(60_000, 20);

export const webhookLimiter = makeLimiter(60_000, config.webhookRateLimitPerMin);
