export type CaptchaResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "invalid" | "unavailable";
    };

export async function verifyCaptcha(
  token: string,
  ip?: string,
): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "not_configured" };

  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const result = (await response.json()) as { success?: boolean };
    return result.success ? { ok: true } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
