const MAX_STATE_AGE_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export type OAuthStatePayload = {
  u: string;
  n: string;
  t: number;
};

export async function createOAuthState(payload: OAuthStatePayload, secret: string): Promise<string> {
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not configured");
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyOAuthState(state: string, secret: string): Promise<OAuthStatePayload | null> {
  if (!state || !secret) return null;
  const [encodedPayload, providedSignature, extra] = state.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(providedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
    const age = Date.now() - Number(payload.t);
    if (!payload.u || !payload.n || !Number.isFinite(payload.t)) return null;
    if (age < -MAX_CLOCK_SKEW_MS || age > MAX_STATE_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return bytesToBase64Url(signature);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function base64UrlEncode(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
