import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, Divider,
  InputAdornment,
} from "@mui/material";
import { Add, Refresh, Business, Search, CheckCircle } from "@mui/icons-material";
import { supabase } from "../supabaseClient";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "archived";
  country_code: string | null;
  fiscal_id: string | null;
  provisioned_at: string | null;
  created_at: string;
}

interface FiscalData {
  fiscal_id: string;
  legal_name: string;
  trade_name?: string;
  status: string;
  condition?: string;
  address?: string;
  district?: string;
  province?: string;
  department?: string;
  country: string;
  raw: Record<string, unknown>;
}

interface ProvisionForm {
  country: string;
  fiscalId: string;
  name: string;
  slug: string;
  ownerAuthUserId: string;
  ownerEmail: string;
  ownerName: string;
  planCode: string;
}

const EMPTY_FORM: ProvisionForm = {
  country: "PE", fiscalId: "", name: "", slug: "",
  ownerAuthUserId: "", ownerEmail: "", ownerName: "", planCode: "free",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  active: "success", provisioning: "warning", suspended: "error", archived: "default",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Activo", provisioning: "Provisionando", suspended: "Suspendido", archived: "Archivado",
};

function slugify(v: string) {
  return v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

async function callFunction(name: string, body: unknown, token: string) {
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
  return json;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProvisionForm>(EMPTY_FORM);
  const [fiscalData, setFiscalData] = useState<FiscalData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionSuccess, setProvisionSuccess] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .schema("platform")
      .from("tenants")
      .select("id, slug, name, schema_name, status, country_code, fiscal_id, provisioned_at, created_at")
      .order("created_at", { ascending: false });
    setTenants((data as Tenant[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  function setField<K extends keyof ProvisionForm>(k: K, v: ProvisionForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleClose() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setFiscalData(null);
    setLookupError(null);
    setProvisionError(null);
    setProvisionSuccess(null);
  }

  // ── Consulta fiscal ────────────────────────────────────────────────────────

  async function handleLookup() {
    if (!form.fiscalId.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    setFiscalData(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await callFunction("ruc-lookup", {
        country: form.country,
        fiscal_id: form.fiscalId.trim(),
      }, session.access_token);

      const fd: FiscalData = res.data;
      setFiscalData(fd);

      // Pre-rellenar nombre y slug automáticamente
      setForm((f) => ({
        ...f,
        name: fd.legal_name,
        slug: slugify(fd.legal_name),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "FISCAL_ID_NOT_FOUND") setLookupError("RUC no encontrado en SUNAT.");
      else if (msg === "FISCAL_ID_INVALID") setLookupError("Formato de RUC inválido (11 dígitos).");
      else setLookupError(`Error al consultar: ${msg}`);
    } finally {
      setLookingUp(false);
    }
  }

  // ── Provisioning ───────────────────────────────────────────────────────────

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    setProvisionError(null);
    setProvisionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const res = await callFunction("tenant-provision", {
        slug:            form.slug,
        name:            form.name,
        ownerAuthUserId: form.ownerAuthUserId,
        ownerEmail:      form.ownerEmail,
        ownerName:       form.ownerName || undefined,
        countryCode:     form.country,
        planCode:        form.planCode,
        fiscalId:        (fiscalData?.fiscal_id ?? form.fiscalId) || undefined,
        fiscalData:      fiscalData?.raw,
      }, session.access_token);

      setProvisionSuccess(`Tenant "${form.name}" creado — schema: ${res.schemaName}`);
      await loadTenants();
      setTimeout(handleClose, 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "SLUG_ALREADY_EXISTS") setProvisionError("Ya existe un tenant con ese slug.");
      else if (msg === "FISCAL_ID_ALREADY_EXISTS") setProvisionError("Ya existe un tenant con ese RUC.");
      else setProvisionError(msg);
    } finally {
      setProvisioning(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Cabecera */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Business color="primary" />
          <Typography variant="h5">Tenants</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={loadTenants} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>
            Nuevo tenant
          </Button>
        </Box>
      </Box>

      {/* Tabla */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>RUC / Fiscal ID</TableCell>
                <TableCell>Schema</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Alta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No hay tenants aún. Crea el primero.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{t.slug}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {t.fiscal_id ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                        {t.schema_name}
                      </Typography>
                    </TableCell>
                    <TableCell>{t.country_code ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABEL[t.status] ?? t.status}
                        color={STATUS_COLOR[t.status] ?? "default"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{fmt(t.provisioned_at ?? t.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo de provisioning ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo tenant</DialogTitle>
        <Box component="form" onSubmit={handleProvision}>
          <DialogContent>
            {provisionError  && <Alert severity="error"   sx={{ mb: 2 }}>{provisionError}</Alert>}
            {provisionSuccess && <Alert severity="success" sx={{ mb: 2 }}>{provisionSuccess}</Alert>}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 0.5 }}>

              {/* País */}
              <TextField
                label="País" select
                value={form.country}
                onChange={(e) => { setField("country", e.target.value); setFiscalData(null); setLookupError(null); }}
                fullWidth size="small"
              >
                <MenuItem value="PE">🇵🇪 Perú (RUC)</MenuItem>
              </TextField>

              {/* Consulta fiscal */}
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <TextField
                  label="RUC"
                  value={form.fiscalId}
                  onChange={(e) => { setField("fiscalId", e.target.value.replace(/\D/g, "").slice(0, 11)); setFiscalData(null); setLookupError(null); }}
                  fullWidth
                  error={!!lookupError}
                  helperText={lookupError ?? "11 dígitos — datos de la empresa se cargan automáticamente"}
                  slotProps={{
                    htmlInput: { maxLength: 11, inputMode: "numeric" },
                    input: {
                      endAdornment: fiscalData && (
                        <InputAdornment position="end">
                          <CheckCircle color="success" fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Button
                  variant="outlined"
                  startIcon={lookingUp ? <CircularProgress size={16} /> : <Search />}
                  onClick={handleLookup}
                  disabled={lookingUp || form.fiscalId.length !== 11}
                  sx={{ mt: 0.5, whiteSpace: "nowrap", minWidth: 120 }}
                >
                  {lookingUp ? "Buscando…" : "Buscar RUC"}
                </Button>
              </Box>

              {/* Card con resultado de la consulta fiscal */}
              {fiscalData && (
                <Box sx={{ bgcolor: "success.50", border: "1px solid", borderColor: "success.200", borderRadius: 2, p: 2 }}>
                  <Typography variant="subtitle2" color="success.dark" sx={{ mb: 0.5 }}>
                    Empresa encontrada en SUNAT
                  </Typography>
                  <Typography variant="body2"><b>Razón social:</b> {fiscalData.legal_name}</Typography>
                  {fiscalData.trade_name && (
                    <Typography variant="body2"><b>Nombre comercial:</b> {fiscalData.trade_name}</Typography>
                  )}
                  <Typography variant="body2"><b>Estado:</b> {fiscalData.status} {fiscalData.condition ? `/ ${fiscalData.condition}` : ""}</Typography>
                  {fiscalData.address && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12 }}>
                      {fiscalData.address}{fiscalData.district ? `, ${fiscalData.district}` : ""}
                      {fiscalData.department ? ` — ${fiscalData.department}` : ""}
                    </Typography>
                  )}
                </Box>
              )}

              <Divider />

              {/* Nombre y slug (pre-rellenados o editables) */}
              <TextField
                label="Razón social"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                required fullWidth
              />
              <TextField
                label="Slug (identificador)"
                value={form.slug}
                onChange={(e) => setField("slug", slugify(e.target.value))}
                required fullWidth
                helperText="Solo minúsculas, números y guiones"
              />

              <Divider />
              <Typography variant="subtitle2" color="text.secondary">Usuario owner</Typography>

              <TextField
                label="Auth User ID"
                value={form.ownerAuthUserId}
                onChange={(e) => setField("ownerAuthUserId", e.target.value)}
                required fullWidth
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                helperText="UUID del usuario en Supabase Auth"
              />
              <TextField
                label="Email del owner"
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setField("ownerEmail", e.target.value)}
                required fullWidth
              />
              <TextField
                label="Nombre completo (opcional)"
                value={form.ownerName}
                onChange={(e) => setField("ownerName", e.target.value)}
                fullWidth
              />

              <TextField
                label="Plan" select
                value={form.planCode}
                onChange={(e) => setField("planCode", e.target.value)}
                fullWidth
              >
                <MenuItem value="free">Free — 50 activos, 3 usuarios</MenuItem>
                <MenuItem value="pro">Pro — 1000 activos, 25 usuarios + integración SAP</MenuItem>
                <MenuItem value="enterprise">Enterprise — Ilimitado + SSO</MenuItem>
              </TextField>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={provisioning}>Cancelar</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={provisioning}
              startIcon={provisioning ? <CircularProgress size={16} color="inherit" /> : <Add />}
            >
              {provisioning ? "Provisionando…" : "Crear tenant"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
