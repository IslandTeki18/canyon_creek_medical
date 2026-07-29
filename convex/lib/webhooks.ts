function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyTwilioSignature(args: {
  token: string;
  signature: string;
  url: string;
  params: URLSearchParams;
}): Promise<boolean> {
  const entries = [...args.params.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const payload =
    args.url + entries.map(([key, value]) => `${key}${value}`).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return timingSafeEqual(expected, args.signature);
}

export function normalizedDeliveryState(
  status: string,
): "accepted" | "delivered" | "failed" {
  if (["delivered", "completed"].includes(status)) return "delivered";
  if (
    [
      "failed",
      "undelivered",
      "bounced",
      "complained",
      "delivery_delayed",
    ].includes(status)
  ) {
    return "failed";
  }
  return "accepted";
}
