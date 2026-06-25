import { useState, useEffect } from "react";
import {
  Box, Typography, Card, CardContent, TextField, MenuItem, Switch,
  FormControlLabel, Button, Alert, Divider, CircularProgress, Skeleton,
  Chip, FormGroup, Checkbox, Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Hub, Save, Cable, Sync, History } from "@mui/icons-material";
import { callFn } from "../lib/api";

interface IntegrationData {
  provider: string;
  name: string;
  enabled: boolean;
  base_url: string | null;
  auth_type: string;
  auth_user: string | null;
  has_secret: boolean;
  direction: string;
  entities: string[];
  config: Record<string, unknown>;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
}

interface LogRow {
  entity: string; direction: string; records: number;
  status: string; message: string | null; created_at: string;
}

const PROVIDERS = [
  { value: "generic", label: "REST genérico" },
  { value: "sap", label: "SAP" },
  { value: "oracle", label: "Oracle ERP" },
  { value: "dynamics365", label: "Microsoft Dynamics 365" },
];
const AUTH_TYPES = [
  { value: "none", label: "Sin autenticación" },
  { value: "basic", label: "Basic (usuario/clave)" },
  { value: "bearer", label: "Bearer token" },
  { value: "apikey", label: "API Key (header)" },
];
const ENTITIES = [
  { value: "equipment", label: "Equipos" },
  { value: "work_orders", label: "Órdenes de trabajo" },
  { value: "materials", label: "Repuestos / materiales" },
];

export default function IntegrationsPage() {
  const [form, setForm] = useState<IntegrationData | null>(null);
  const [secret, setSecret] = useState("");
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await callFn<{ data: IntegrationData; log: LogRow[]; role: string }>(
        "tenant-integrations", { action: "get" });
      setForm(res.data);
      setLog(res.log ?? []);
      setCanEdit(["owner", "admin"].includes(res.role));
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function set<K extends keyof IntegrationData>(k: K, v: IntegrationData[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setMsg(null);
  }
  function toggleEntity(v: string) {
    if (!form) return;
    const has = form.entities.includes(v);
    set("entities", has ? form.entities.filter((e) => e !== v) : [...form.entities, v]);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true); setMsg(null);
    try {
      await callFn("tenant-integrations", {
        action: "save",
        data: { ...form, auth_secret: secret || undefined },
      });
      setSecret("");
      await load();
      setMsg({ type: "success", text: "Configuración guardada." });
    } catch (e) { setMsg({ type: "error", text: (e as Error).message }); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setBusy("test"); setMsg(null);
    try {
      const res = await callFn<{ ok: boolean; status?: number; error?: string }>(
        "tenant-integrations", { action: "test" });
      setMsg(res.ok
        ? { type: "success", text: `Conexión OK (HTTP ${res.status}).` }
        : { type: "error", text: `Falló la conexión: ${res.error ?? res.status}` });
    } catch (e) { setMsg({ type: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  async function handleSync() {
    setBusy("sync"); setMsg(null);
    try {
      const res = await callFn<{ ok: boolean; total: number }>(
        "tenant-integrations", { action: "sync" });
      await load();
      setMsg({ type: res.ok ? "success" : "error",
        text: `Sincronización: ${res.total} registro(s).` });
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ type: "error", text: m === "INBOUND_NOT_IMPLEMENTED"
        ? "La dirección 'inbound' requiere conectar el adaptador del ERP." : m });
    } finally { setBusy(null); }
  }

  if (loading || !form) {
    return <Box><Skeleton variant="rectangular" height={400} /></Box>;
  }

  return (
    <Box sx={{ maxWidth: 820 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
        <Hub color="primary" />
        <Typography variant="h5">Integraciones (ERP)</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Conecta el GMAO con SAP, Oracle, Dynamics u otro ERP vía REST.
      </Typography>

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Solo administradores pueden configurar la integración (modo lectura).
        </Alert>
      )}

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Cable color="primary" fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Conexión</Typography>
            </Box>
            <Chip size="small"
              label={form.enabled ? "Activa" : "Inactiva"}
              color={form.enabled ? "success" : "default"} />
          </Box>
          <Divider sx={{ mb: 2 }} />

          <FormControlLabel
            control={<Switch checked={form.enabled} disabled={!canEdit}
              onChange={(e) => set("enabled", e.target.checked)} />}
            label="Integración habilitada" sx={{ mb: 1 }} />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Proveedor" select value={form.provider} disabled={!canEdit}
                onChange={(e) => set("provider", e.target.value)} sx={{ width: 240 }}>
                {PROVIDERS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </TextField>
              <TextField label="Nombre" value={form.name} disabled={!canEdit}
                onChange={(e) => set("name", e.target.value)} fullWidth />
            </Box>
            <TextField label="URL base del servicio" value={form.base_url ?? ""} disabled={!canEdit}
              onChange={(e) => set("base_url", e.target.value)} fullWidth
              placeholder="https://erp.empresa.com/api" />
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Tipo de autenticación" select value={form.auth_type} disabled={!canEdit}
                onChange={(e) => set("auth_type", e.target.value)} sx={{ width: 280 }}>
                {AUTH_TYPES.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
              </TextField>
              <TextField label="Dirección" select value={form.direction} disabled={!canEdit}
                onChange={(e) => set("direction", e.target.value)} fullWidth>
                <MenuItem value="outbound">GMAO → ERP (salida)</MenuItem>
                <MenuItem value="inbound">ERP → GMAO (entrada)</MenuItem>
                <MenuItem value="both">Bidireccional</MenuItem>
              </TextField>
            </Box>
            {form.auth_type !== "none" && (
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label={form.auth_type === "apikey" ? "Nombre del header" : "Usuario"}
                  value={form.auth_user ?? ""} disabled={!canEdit}
                  onChange={(e) => set("auth_user", e.target.value)} fullWidth
                  placeholder={form.auth_type === "apikey" ? "X-API-Key" : ""} />
                <TextField
                  label={form.has_secret ? "Secreto (•••• guardado)" : "Secreto / clave / token"}
                  type="password" value={secret} disabled={!canEdit}
                  onChange={(e) => setSecret(e.target.value)} fullWidth
                  placeholder={form.has_secret ? "Dejar vacío para no cambiar" : ""} />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Entidades a sincronizar</Typography>
          <Divider sx={{ mb: 1 }} />
          <FormGroup row>
            {ENTITIES.map((en) => (
              <FormControlLabel key={en.value}
                control={<Checkbox checked={form.entities.includes(en.value)} disabled={!canEdit}
                  onChange={() => toggleEntity(en.value)} />}
                label={en.label} />
            ))}
          </FormGroup>
        </CardContent>
      </Card>

      {canEdit && (
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            onClick={handleSave} disabled={saving}>Guardar</Button>
          <Button variant="outlined" startIcon={busy === "test" ? <CircularProgress size={16} /> : <Cable />}
            onClick={handleTest} disabled={!!busy || !form.base_url}>Probar conexión</Button>
          <Button variant="outlined" color="secondary"
            startIcon={busy === "sync" ? <CircularProgress size={16} /> : <Sync />}
            onClick={handleSync} disabled={!!busy || !form.enabled}>Sincronizar ahora</Button>
        </Box>
      )}

      {form.last_sync_at && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Última sincronización: {new Date(form.last_sync_at).toLocaleString("es-PE")} —
          {" "}{form.last_sync_status === "ok" ? "✅" : "⚠️"} {form.last_sync_message}
        </Typography>
      )}

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <History color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Bitácora de sincronización</Typography>
          </Box>
          <Divider sx={{ mb: 1 }} />
          {log.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Aún no hay sincronizaciones.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell><TableCell>Entidad</TableCell>
                  <TableCell align="right">Registros</TableCell><TableCell>Estado</TableCell>
                  <TableCell>Mensaje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {log.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell><Typography variant="caption">{new Date(l.created_at).toLocaleString("es-PE")}</Typography></TableCell>
                    <TableCell>{l.entity}</TableCell>
                    <TableCell align="right">{l.records}</TableCell>
                    <TableCell>
                      <Chip size="small" label={l.status} color={l.status === "ok" ? "success" : "error"} variant="outlined" />
                    </TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{l.message ?? "—"}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
