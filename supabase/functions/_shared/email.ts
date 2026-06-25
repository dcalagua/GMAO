// Envío de correo vía Microsoft Graph API (client credentials flow).
// Requiere los secrets: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MAIL_FROM
// Solo hace HTTPS, compatible con Edge Functions.

interface TokenCache { token: string; expiresAt: number }
let _cache: TokenCache | null = null;

async function getGraphToken(): Promise<string | null> {
  const tenant = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const secret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenant || !clientId || !secret) return null;

  // Reutilizar token si quedan más de 60s de vida
  if (_cache && _cache.expiresAt - 60_000 > Date.now()) return _cache.token;

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    console.error("Graph token error:", await res.text());
    return null;
  }
  const data = await res.json();
  _cache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return _cache.token;
}

/** Envía un email. Best-effort: si no hay credenciales o falla, no lanza error. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!to) return false;
  const from = Deno.env.get("MAIL_FROM");
  if (!from) return false;

  try {
    const token = await getGraphToken();
    if (!token) return false;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: false,
        }),
      },
    );

    if (!res.ok) {
      console.error("Graph sendMail error:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendEmail exception:", err);
    return false;
  }
}

/** True si las credenciales de email están configuradas. */
export function emailConfigured(): boolean {
  return !!(Deno.env.get("AZURE_TENANT_ID") && Deno.env.get("AZURE_CLIENT_ID")
         && Deno.env.get("AZURE_CLIENT_SECRET") && Deno.env.get("MAIL_FROM"));
}
