import { config } from "../../core/config";
import { UpstreamServiceError, ValidationError } from "../../core/errors";
import type { ContactStatus } from "../../db/collections";

export const DEFAULT_COUNTRY_CODE = "91";

export interface WabaRecipient {
  mobile: string;
  headerValues?: { headerData: string; headerFileName?: string };
  bodyValues?: Record<string, string>;
}

export interface RecipientResult {
  mobile: string | null;
  messageId: string | null;
  status: string | null;
  accepted: boolean;
}

export interface WabaSendResult {
  raw: unknown;
  results: RecipientResult[];
}

function requireAuthKey(): string {
  if (!config.sarvWabaAuthKey) {
    throw new UpstreamServiceError(
      "Sarv WABA is not configured (missing SARV_WABA_AUTHKEY). Add it to whatsapp-service/.env."
    );
  }
  return config.sarvWabaAuthKey;
}

export function normalizeMobile(phoneNumber: string, countryCode: string = DEFAULT_COUNTRY_CODE): string {
  let digits = phoneNumber.replace(/\D/g, "");
  if (digits.startsWith(countryCode) && digits.length === countryCode.length + 10) {
    digits = digits.slice(countryCode.length);
  }
  if (digits.length < 8 || digits.length > 12) {
    throw new ValidationError(`Invalid mobile number: ${phoneNumber}`);
  }
  return digits;
}

export function normalizeWebhookMobile(
  raw: string | undefined | null,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith(countryCode) && digits.length > 10) {
    digits = digits.slice(digits.length - 10);
  }
  if (digits.length < 8 || digits.length > 12) return null;
  return digits;
}

export function mapDeliveryStatus(raw: string | null | undefined): { status: ContactStatus; rank: number } {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return { status: "sent", rank: 1 };
  if (/(undeliver|not\s*deliver|fail|reject|expire|invalid|block|bounce|error)/.test(s)) {
    return { status: "failed", rank: 5 };
  }
  if (/(read|seen)/.test(s)) return { status: "read", rank: 4 };
  if (/deliver/.test(s)) return { status: "delivered", rank: 3 };
  if (/(sent|submit|accept|queue|process|success|pending)/.test(s)) return { status: "sent", rank: 1 };
  return { status: "sent", rank: 1 };
}

export const STATUS_RANK: Record<ContactStatus, number> = {
  pending: 0,
  sent: 1,
  error: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

const FAILURE_TOKENS = /(fail|reject|undeliver|expire|invalid|block|error|not\s*sent)/i;

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return null;
}

export function parseRecipientResults(raw: unknown): RecipientResult[] {
  const containers: unknown[] = [];
  if (Array.isArray(raw)) containers.push(raw);
  if (raw && typeof raw === "object") {
    for (const key of ["data", "response", "result", "results", "messages", "recipients"]) {
      const v = (raw as Record<string, unknown>)[key];
      if (Array.isArray(v)) containers.push(v);
    }
  }
  const arr = containers.find((c) => Array.isArray(c) && c.length) as unknown[] | undefined;
  if (!arr) return [];

  return arr
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const r = row as Record<string, unknown>;
      const mobile =
        coerceString(r.mobile) ??
        coerceString(r.mobileNumber) ??
        coerceString(r.number) ??
        coerceString(r.msisdn) ??
        coerceString(r.to);
      const messageId =
        coerceString(r.id) ??
        coerceString(r.msgId) ??
        coerceString(r.messageId) ??
        coerceString(r.message_id) ??
        coerceString(r.uniqueId) ??
        coerceString(r.logId) ??
        coerceString(r.log_id);
      const status = coerceString(r.status) ?? coerceString(r.desc) ?? coerceString(r.message);
      const accepted = !(status && FAILURE_TOKENS.test(status));
      return {
        mobile: mobile ? mobile.replace(/\D/g, "") : null,
        messageId,
        status,
        accepted,
      };
    });
}

export async function sendTemplateBatch(
  wid: string,
  type: "text" | "media",
  recipients: WabaRecipient[],
  countryCode: string = DEFAULT_COUNTRY_CODE
): Promise<WabaSendResult> {
  if (!recipients.length) {
    throw new ValidationError("At least one recipient is required");
  }
  if (recipients.length > config.sarvWabaMaxRecipientsPerRequest) {
    throw new ValidationError(
      `Sarv WABA accepts at most ${config.sarvWabaMaxRecipientsPerRequest} recipients per request`
    );
  }

  const authKey = requireAuthKey();
  const body = {
    version: "2.0",
    country_code: countryCode,
    wid,
    type,
    data: recipients.map((r) => ({
      mobile: r.mobile,
      ...(r.headerValues ? { headerValues: r.headerValues } : {}),
      ...(r.bodyValues ? { bodyValues: r.bodyValues } : {}),
    })),
  };

  let response: Response;
  try {
    response = await fetch(`${config.sarvWabaBaseUrl}/requestjson.php`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new UpstreamServiceError(`Sarv WABA request did not complete: ${err?.message ?? err}`, true);
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new UpstreamServiceError(`Sarv WABA request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return { raw: parsed, results: parseRecipientResults(parsed) };
}

export async function getBalance(): Promise<unknown> {
  const authKey = requireAuthKey();
  const response = await fetch(`${config.sarvWabaBaseUrl}/getbalance.php?authkey=${encodeURIComponent(authKey)}`);
  const text = await response.text();
  if (!response.ok) {
    throw new UpstreamServiceError(`Could not fetch Sarv WABA balance (${response.status}): ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
