import { config } from "../../core/config";
import { UpstreamServiceError, ValidationError } from "../../core/errors";
import { DEFAULT_COUNTRY_CODE } from "../whatsapp/sarvGateway";

interface RcsSuccessResponse {
  status: "Success";
  code: number;
  LogID: string;
  Message: string;
}

interface RcsFailureResponse {
  status: "failure";
  code: number;
  desc?: string;
  Message?: string;
}

type RcsResponse = RcsSuccessResponse | RcsFailureResponse;

function isFailure(r: RcsResponse): r is RcsFailureResponse {
  return r.status !== "Success";
}

function requireAuthKey(): string {
  if (!config.sarvWabaAuthKey) {
    throw new UpstreamServiceError(
      "Sarv RCS is not configured (missing SARV_WABA_AUTHKEY — same portal authkey as WhatsApp WABA)."
    );
  }
  return config.sarvWabaAuthKey;
}

export async function sendBulkRcs(
  templateId: string,
  sender: string,
  dest: string[],
  params: Record<string, string>,
  countryCode: string = DEFAULT_COUNTRY_CODE
): Promise<{ logId: string; raw: unknown }> {
  if (!dest.length) throw new ValidationError("At least one recipient is required");
  if (dest.length > config.sarvRcsMaxRecipientsPerRequest) {
    throw new ValidationError(`Sarv RCS is capped at ${config.sarvRcsMaxRecipientsPerRequest} recipients per request here`);
  }

  const authKey = requireAuthKey();
  const isUnicode = Object.values(params || {}).some((v) => /[^\x00-\x7F]/.test(String(v ?? ""))) ? 1 : 0;
  const body = {
    version: "1.0",
    authkey: authKey,
    encrpt: "0",
    template_id: templateId,
    country_code: countryCode,
    is_unicode: isUnicode,
    sender,
    messages: [{ dest, param: params }],
  };

  let response: Response;
  try {
    response = await fetch(`${config.sarvWabaBaseUrl}/bulkrcs_json.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new UpstreamServiceError(`Sarv RCS request did not complete: ${err?.message ?? err}`, true);
  }

  const text = await response.text();
  let parsed: RcsResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UpstreamServiceError(`Sarv RCS returned a non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!response.ok || isFailure(parsed)) {
    const detail = isFailure(parsed) ? parsed.desc || parsed.Message || "Unknown error" : text;
    throw new UpstreamServiceError(`Sarv RCS request failed (${parsed.code ?? response.status}): ${detail}`);
  }

  return { logId: parsed.LogID, raw: parsed };
}
