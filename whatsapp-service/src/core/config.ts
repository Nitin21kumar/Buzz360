import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(required("PORT", "4000"), 10),
  environment: required("ENVIRONMENT", "development"),

  databaseUrl: required("DATABASE_URL", "postgresql://buzz360_app:change_me@localhost:5432/buzz360"),

  firebaseServiceAccountPath: required("FIREBASE_SERVICE_ACCOUNT_PATH"),

  allowedOriginsRaw: required("ALLOWED_ORIGINS"),

  sarvWabaAuthKey: required("SARV_WABA_AUTHKEY"),
  sarvWabaBaseUrl: required("SARV_WABA_BASE_URL", "https://waba.sarv.com/restapi"),
  sarvWabaMaxRecipientsPerRequest: parseInt(required("SARV_WABA_MAX_RECIPIENTS_PER_REQUEST", "200"), 10),

  sarvRcsMaxRecipientsPerRequest: parseInt(required("SARV_RCS_MAX_RECIPIENTS_PER_REQUEST", "100"), 10),

  maxContactsPerCampaign: parseInt(required("MAX_CONTACTS_PER_CAMPAIGN", "50000"), 10),

  statusWebhookSecret: required("WHATSAPP_STATUS_WEBHOOK_SECRET"),

  webhookRateLimitPerMin: parseInt(required("WEBHOOK_RATE_LIMIT_PER_MIN", "6000"), 10),

  reconcileStaleSentAfterHours: parseInt(required("RECONCILE_STALE_SENT_AFTER_HOURS", "24"), 10),

  rateLimitEnabled: required("RATE_LIMIT_ENABLED", "true") !== "false",

  get isProduction(): boolean {
    return this.environment.toLowerCase() === "production";
  },

  get allowedOrigins(): string[] {
    const origins = this.allowedOriginsRaw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return origins.length ? origins : ["*"];
  },
};

export function validateConfigForProduction(): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (!config.allowedOriginsRaw.trim() || config.allowedOrigins.includes("*")) {
    problems.push("ALLOWED_ORIGINS must be set to your real frontend/gateway origin(s) in production.");
  }
  if (!config.firebaseServiceAccountPath) {
    problems.push("FIREBASE_SERVICE_ACCOUNT_PATH must be set so login tokens can be verified.");
  }
  if (!config.sarvWabaAuthKey) {
    problems.push("SARV_WABA_AUTHKEY must be set to actually send WhatsApp messages.");
  }
  if (!config.statusWebhookSecret) {
    problems.push("WHATSAPP_STATUS_WEBHOOK_SECRET must be set before wiring up Sarv's status webhook.");
  }
  if (problems.length) {
    throw new Error(
      "Refusing to start with ENVIRONMENT=production and an insecure configuration:\n- " + problems.join("\n- ")
    );
  }
}
