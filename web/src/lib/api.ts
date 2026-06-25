import { supabase } from "../supabaseClient";

export async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sin sesión activa");
  return session.access_token;
}

export async function callFn<T = unknown>(name: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

// ─── Cache de lista ────────────────────────────────────────────────────────────
// Evita cold-starts visibles al usuario: AppLayout precarga en background,
// y las páginas consumen desde cache si tiene menos de 60s de antigüedad.

const TTL_MS = 60_000;

interface CacheEntry { data: unknown; ts: number; promise?: Promise<unknown> }
const _cache = new Map<string, CacheEntry>();

export function invalidateCache(key: string) {
  _cache.delete(key);
}

export async function callFnCached<T = unknown>(
  name: string,
  body: unknown,
  cacheKey: string,
): Promise<T> {
  const hit = _cache.get(cacheKey);
  // Cache fresco — devolver inmediatamente
  if (hit && !hit.promise && Date.now() - hit.ts < TTL_MS) return hit.data as T;
  // Fetch en vuelo — reusar la misma promesa para evitar doble petición
  if (hit?.promise) return hit.promise as Promise<T>;

  const promise = callFn<T>(name, body).then((data) => {
    _cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  });
  _cache.set(cacheKey, { data: hit?.data, ts: hit?.ts ?? 0, promise });
  return promise;
}

// Precarga silenciosa — llamar al montar AppLayout
export function preloadGmao() {
  const fns = [
    { name: "tenant-equipment",         body: { action: "list" }, key: "equipment:list" },
    { name: "tenant-work-orders",       body: { action: "list" }, key: "work-orders:list" },
    { name: "tenant-maintenance-plans", body: { action: "list" }, key: "plans:list" },
  ];
  for (const f of fns) {
    callFnCached(f.name, f.body, f.key).catch(() => { /* silencioso */ });
  }
}
