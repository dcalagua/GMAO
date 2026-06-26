import { useState, useEffect } from "react";
import {
  Box, Typography, Card, CardContent, Switch, FormControlLabel,
  TextField, Button, Alert, Divider, CircularProgress, Skeleton, Chip,
} from "@mui/material";
import { Settings, AutoMode, NotificationsActive, Save, Email, Paid, Extension } from "@mui/icons-material";
import { callFn } from "../lib/api";

interface SettingsData {
  auto_generate_wo: boolean;
  autogen_lead_days: number;
  notify_email: boolean;
  notify_assignment: boolean;
  notify_overdue: boolean;
  overdue_alert_days: number;
  low_stock_alerts: boolean;
  labor_rate_per_hour: number;
  avisos_enabled: boolean;
  reservas_enabled: boolean;
}

const DEFAULTS: SettingsData = {
  auto_generate_wo: true, autogen_lead_days: 0, notify_email: true,
  notify_assignment: true, notify_overdue: true, overdue_alert_days: 7,
  low_stock_alerts: true, labor_rate_per_hour: 0,
  avisos_enabled: true, reservas_enabled: true,
};

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    callFn<{ data: SettingsData; role: string; email_configured: boolean }>(
      "tenant-settings", { action: "get" }
    ).then((res) => {
      if (res.data) setForm(res.data);
      setCanEdit(["owner", "admin"].includes(res.role));
      setEmailConfigured(res.email_configured);
    }).catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSuccess(false);
  }

  async function handleSave() {
    setSaving(true); setError(null); setSuccess(false);
    try {
      await callFn("tenant-settings", { action: "update", data: form });
      setSuccess(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleTestEmail() {
    setTesting(true); setTestResult(null);
    try {
      const res = await callFn<{ sent_to: string }>("tenant-settings", { action: "test_email" });
      setTestResult({ ok: true, msg: `Email de prueba enviado a ${res.sent_to}. Revisa tu bandeja.` });
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message });
    } finally { setTesting(false); }
  }

  if (loading) {
    return <Box><Skeleton variant="rectangular" height={400} /></Box>;
  }

  return (
    <Box sx={{ maxWidth: 760 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
        <Settings color="primary" />
        <Typography variant="h5">Configuración</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ajusta el comportamiento del GMAO para tu organización
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Configuración guardada.</Alert>}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Solo administradores pueden modificar la configuración. Estás en modo lectura.
        </Alert>
      )}

      {/* ── Mantenimiento preventivo ────────────────────────────────────────── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <AutoMode color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Generación automática de OTs</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.auto_generate_wo} disabled={!canEdit}
              onChange={(e) => set("auto_generate_wo", e.target.checked)} />}
            label="Generar órdenes de trabajo preventivas automáticamente desde los planes" />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 6, mb: 2 }}>
            Cada día a las 6:00 AM se crean las OTs de los planes que llegan a su fecha.
          </Typography>
          <TextField
            label="Días de anticipación" type="number" size="small"
            value={form.autogen_lead_days} disabled={!canEdit || !form.auto_generate_wo}
            onChange={(e) => set("autogen_lead_days", Number(e.target.value))}
            slotProps={{ htmlInput: { min: 0, max: 30 } }}
            helperText="Generar la OT N días antes del vencimiento (0 = el mismo día)"
            sx={{ width: 280 }} />
        </CardContent>
      </Card>

      {/* ── Notificaciones ──────────────────────────────────────────────────── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <NotificationsActive color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Notificaciones</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.notify_assignment} disabled={!canEdit}
              onChange={(e) => set("notify_assignment", e.target.checked)} />}
            label="Avisar al técnico cuando se le asigna una OT" />
          <Box sx={{ height: 8 }} />
          <FormControlLabel
            control={<Switch checked={form.notify_overdue} disabled={!canEdit}
              onChange={(e) => set("notify_overdue", e.target.checked)} />}
            label="Alertar sobre planes de mantenimiento próximos a vencer" />
          <TextField
            label="Días de alerta previa" type="number" size="small"
            value={form.overdue_alert_days} disabled={!canEdit || !form.notify_overdue}
            onChange={(e) => set("overdue_alert_days", Number(e.target.value))}
            slotProps={{ htmlInput: { min: 1, max: 60 } }}
            helperText="Alertar cuando un plan vence en N días"
            sx={{ width: 280, mt: 2, display: "block" }} />
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={form.low_stock_alerts} disabled={!canEdit}
                onChange={(e) => set("low_stock_alerts", e.target.checked)} />}
              label="Alertar repuestos con stock bajo o agotado" />
          </Box>
        </CardContent>
      </Card>

      {/* ── Costos ──────────────────────────────────────────────────────────── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Paid color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Costos</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <TextField
            label="Tarifa de mano de obra (S/ por hora)" type="number" size="small"
            value={form.labor_rate_per_hour} disabled={!canEdit}
            onChange={(e) => set("labor_rate_per_hour", Number(e.target.value))}
            slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
            helperText="Se usa para calcular el costo de mano de obra de las OTs en Reportes"
            sx={{ width: 320 }} />
        </CardContent>
      </Card>

      {/* ── Módulos (SAP PM) ────────────────────────────────────────────────── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Extension color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Módulos</Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.avisos_enabled} disabled={!canEdit}
              onChange={(e) => set("avisos_enabled", e.target.checked)} />}
            label="Avisos de mantenimiento (flujo SAP PM: aviso → orden)" />
          <Box sx={{ height: 8 }} />
          <FormControlLabel
            control={<Switch checked={form.reservas_enabled} disabled={!canEdit}
              onChange={(e) => set("reservas_enabled", e.target.checked)} />}
            label="Reservas de materiales en OT (apartar stock sin consumir)" />
        </CardContent>
      </Card>

      {/* ── Email ───────────────────────────────────────────────────────────── */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Email color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Correo electrónico</Typography>
            {emailConfigured
              ? <Chip label="Activo" color="success" size="small" sx={{ ml: 1 }} />
              : <Chip label="No configurado" color="default" size="small" sx={{ ml: 1 }} />}
          </Box>
          <Divider sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.notify_email} disabled={!canEdit || !emailConfigured}
              onChange={(e) => set("notify_email", e.target.checked)} />}
            label="Enviar notificaciones también por email (Microsoft 365)" />
          {!emailConfigured ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              El envío de emails requiere configurar en Supabase los secrets
              <code> AZURE_TENANT_ID</code>, <code>AZURE_CLIENT_ID</code>,
              <code> AZURE_CLIENT_SECRET</code> y <code>MAIL_FROM</code>.
              Mientras tanto, las notificaciones funcionan dentro de la aplicación (campana 🔔).
            </Alert>
          ) : canEdit && (
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" size="small" onClick={handleTestEmail} disabled={testing}
                startIcon={testing ? <CircularProgress size={14} /> : <Email />}>
                {testing ? "Enviando…" : "Enviar email de prueba"}
              </Button>
              {testResult && (
                <Alert severity={testResult.ok ? "success" : "error"} sx={{ mt: 1.5 }}>
                  {testResult.msg}
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
          onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar configuración"}
        </Button>
      )}
    </Box>
  );
}
