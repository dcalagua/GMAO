import { corsHeaders, json } from "../_shared/tenant.ts";

const FACTILIZA_TOKEN = Deno.env.get("FACTILIZA_TOKEN")!;
const FACTILIZA_BASE  = "https://api.factiliza.com/v1";

export interface FiscalResult {
  fiscal_id:   string;
  legal_name:  string;
  trade_name?: string;
  status:      string;
  condition?:  string;
  address?:    string;
  district?:   string;
  province?:   string;
  department?: string;
  country:     string;
  raw:         Record<string, unknown>;
}

// Proveedores de consulta fiscal por país
const PROVIDERS: Record<string, (id: string) => Promise<FiscalResult>> = {
  PE: lookupRucPeru,
};

async function lookupRucPeru(ruc: string): Promise<FiscalResult> {
  if (!/^\d{11}$/.test(ruc)) {
    throw new Error("RUC_INVALID_FORMAT: debe tener 11 dígitos");
  }

  const res = await fetch(`${FACTILIZA_BASE}/ruc/info/${ruc}`, {
    headers: { Authorization: `Bearer ${FACTILIZA_TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FACTILIZA_ERROR:${res.status}:${text}`);
  }

  const body = await res.json() as Record<string, unknown>;
  // Factiliza puede devolver el objeto directamente o dentro de { data: {...} }
  const d = (body.data ?? body) as Record<string, unknown>;

  if (!d.razon_social) throw new Error("RUC_NOT_FOUND");

  return {
    fiscal_id:   ruc,
    legal_name:  String(d.razon_social ?? "").trim(),
    trade_name:  d.nombre_comercial ? String(d.nombre_comercial).trim() : undefined,
    status:      String(d.estado ?? "DESCONOCIDO").trim(),
    condition:   d.condicion   ? String(d.condicion).trim()   : undefined,
    address:     d.direccion   ? String(d.direccion).trim()   : undefined,
    district:    d.distrito    ? String(d.distrito).trim()    : undefined,
    province:    d.provincia   ? String(d.provincia).trim()   : undefined,
    department:  d.departamento ? String(d.departamento).trim() : undefined,
    country:     "PE",
    raw:         d,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: { country?: string; fiscal_id?: string };
  try { body = await req.json(); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  const country   = (body.country   ?? "PE").toUpperCase();
  const fiscal_id = (body.fiscal_id ?? "").trim().replace(/\s+/g, "");

  if (!fiscal_id) return json({ error: "MISSING_FISCAL_ID" }, 400);

  const provider = PROVIDERS[country];
  if (!provider) {
    return json({ error: "COUNTRY_NOT_SUPPORTED", country,
                  supported: Object.keys(PROVIDERS) }, 400);
  }

  try {
    const result = await provider(fiscal_id);
    return json({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("RUC_NOT_FOUND"))    return json({ error: "FISCAL_ID_NOT_FOUND" }, 404);
    if (msg.startsWith("RUC_INVALID"))      return json({ error: "FISCAL_ID_INVALID", detail: msg }, 400);
    return json({ error: "LOOKUP_FAILED", detail: msg }, 500);
  }
});
