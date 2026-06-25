import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton,
} from "@mui/material";
import { Add, Refresh, Business } from "@mui/icons-material";
import { supabase } from "../supabaseClient";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  status: "provisioning" | "active" | "suspended" | "archived";
  country_code: string | null;
  timezone: string;
  provisioned_at: string | null;
  created_at: string;
}

interface ProvisionForm {
  slug: string;
  name: string;
  ownerAuthUserId: string;
  ownerEmail: string;
  ownerName: string;
  countryCode: string;
  planCode: string;
}

const EMPTY_FORM: ProvisionForm = {
  slug: "", name: "", ownerAuthUserId: "", ownerEmail: "",
  ownerName: "", countryCode: "PE", planCode: "free",
};

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

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProvisionForm>(EMPTY_FORM);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionSuccess, setProvisionSuccess] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .schema("platform")
      .from("tenants")
      .select("id, slug, name, schema_name, status, country_code, timezone, provisioned_at, created_at")
      .order("created_at", { ascending: false });
    setTenants((data as Tenant[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  function handleNameChange(value: string) {
    setForm((f) => ({ ...f, name: value, slug: slugify(value) }));
  }

  function handleClose() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setProvisionError(null);
    setProvisionSuccess(null);
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    setProvisionError(null);
    setProvisionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No hay sesión activa");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-provision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            slug: form.slug,
            name: form.name,
            ownerAuthUserId: form.ownerAuthUserId,
            ownerEmail: form.ownerEmail,
            ownerName: form.ownerName || undefined,
            countryCode: form.countryCode || undefined,
            planCode: form.planCode,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setProvisionSuccess(`Tenant "${form.name}" creado — schema: ${json.schemaName}`);
      await loadTenants();
      setTimeout(handleClose, 2000);
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : String(err));
    } finally {
      setProvisioning(false);
    }
  }

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
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => { setDialogOpen(true); setProvisionError(null); }}
          >
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
                <TableCell>Slug</TableCell>
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
                    <Typography color="text.secondary">
                      No hay tenants aún. Crea el primero.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{t.slug}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
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

      {/* Diálogo de provisioning */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo tenant</DialogTitle>
        <Box component="form" onSubmit={handleProvision}>
          <DialogContent>
            {provisionError && <Alert severity="error" sx={{ mb: 2 }}>{provisionError}</Alert>}
            {provisionSuccess && <Alert severity="success" sx={{ mb: 2 }}>{provisionSuccess}</Alert>}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 0.5 }}>
              <TextField
                label="Razón social"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required fullWidth placeholder="ACME Perú S.A."
              />
              <TextField
                label="Slug (identificador)"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                required fullWidth
                helperText="Solo letras minúsculas, números y guiones. Se genera automáticamente."
              />

              <Typography variant="subtitle2" color="text.secondary">
                Usuario owner
              </Typography>

              <TextField
                label="Auth User ID (UUID de auth.users)"
                value={form.ownerAuthUserId}
                onChange={(e) => setForm((f) => ({ ...f, ownerAuthUserId: e.target.value }))}
                required fullWidth
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                helperText="UUID del usuario ya creado en Supabase Auth"
              />
              <TextField
                label="Email del owner"
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                required fullWidth
              />
              <TextField
                label="Nombre completo (opcional)"
                value={form.ownerName}
                onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                fullWidth
              />

              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="País" select
                  value={form.countryCode}
                  onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                  fullWidth
                >
                  {["PE", "EC", "BO", "CO", "CL", "MX"].map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Plan" select
                  value={form.planCode}
                  onChange={(e) => setForm((f) => ({ ...f, planCode: e.target.value }))}
                  fullWidth
                >
                  <MenuItem value="free">Free</MenuItem>
                  <MenuItem value="pro">Pro</MenuItem>
                  <MenuItem value="enterprise">Enterprise</MenuItem>
                </TextField>
              </Box>
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
