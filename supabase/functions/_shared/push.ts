// Envío de notificaciones push vía FCM HTTP v1 (Firebase).
// Requiere el secret FCM_SERVICE_ACCOUNT = JSON del service account de Firebase.
// Best-effort: si no está configurado o falla, no lanza error.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let _tok: { token: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(data: Uint8Array | string): string {
  const str = typeof data === "string"
    ? btoa(data)
    : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (_tok && _tok.exp - 60_000 > Date.now()) return _tok.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) { console.error("FCM token error:", await res.text()); return null; }
  const d = await res.json();
  _tok = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return _tok.token;
}

export function pushConfigured(): boolean {
  return !!Deno.env.get("FCM_SERVICE_ACCOUNT");
}

// El secret puede venir como JSON directo o codificado en base64 (un solo token).
function parseServiceAccount(raw: string): ServiceAccount | null {
  const trimmed = raw.trim();
  const txt = trimmed.startsWith("{") ? trimmed : new TextDecoder().decode(
    Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0)),
  );
  try { return JSON.parse(txt) as ServiceAccount; } catch { return null; }
}

/** Envía una notificación a una lista de device tokens. Best-effort. */
export async function sendPush(
  tokens: string[], title: string, body: string, data?: Record<string, string>,
): Promise<void> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw || tokens.length === 0) return;
  const sa = parseServiceAccount(raw);
  if (!sa) return;

  try {
    const access = await getAccessToken(sa);
    if (!access) return;
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    await Promise.all(tokens.map((t) =>
      fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { token: t, notification: { title, body }, data: data ?? {} },
        }),
      }).catch(() => {})
    ));
  } catch (err) {
    console.error("sendPush exception:", err);
  }
}
