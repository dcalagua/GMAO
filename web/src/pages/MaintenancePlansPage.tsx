import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, Switch, FormControlLabel,
} from "@mui/material";
import { Add, Refresh, CalendarMonth, Edit, Delete } from "@mui/icons-material";
import { callFn, callFnCached, invalidateCache } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  frequency_type: string;
  frequency_value: number | null;
  frequency_unit: string | null;
  estimated_hours: number | null;
  last_execution: string | null;
  next_execution: string | null;
  is_active: boolean;
  equipment_id: string | null;
  equipment_code: string | null;
  equipment_name: string | null;
  created_at: string;
}

interface Equipment { id: string; code: string; name: string; }

interface PlanForm {
  code: string; name: string; description: string;
  equipment_id: string; frequency_type: string;
  frequency_value: string; frequency_unit: string;
  estimated_hours: string; next_execution: string; is_active: boolean;
}

const EMPTY: PlanForm = {
  code: "", name: "", description: "", equipment_id: "",
  frequency_type: "calendar", frequency_value: "", frequency_unit: "months",
  estimated_hours: "", next_execution: "", is_active: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_UNIT_LABEL: Record<string, string> = {
  days: "días", weeks: "semanas", months: "meses", years: "años",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function freqLabel(plan: Plan) {
  if (!plan.frequency_value) return "—";
  const unit = FREQ_UNIT_LABEL[plan.frequency_unit ?? ""] ?? plan.frequency_unit;
  return `Cada ${plan.frequency_value} ${unit}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function MaintenancePlansPage() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plRes, eqRes] = await Promise.all([
        callFnCached<{ data: Plan[] }>("tenant-maintenance-plans", { action: "list" }, "plans:list"),
        callFnCached<{ data: Equipment[] }>("tenant-equipment", { action: "list" }, "equipment:list"),
      ]);
      setRows(plRes.data ?? []);
      setEquipment(eqRes.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null); setForm(EMPTY); setSaveError(null); setDialogOpen(true);
  }
  function openEdit(p: Plan) {
    setEditId(p.id);
    setForm({
      code: p.code, name: p.name, description: p.description ?? "",
      equipment_id: p.equipment_id ?? "",
      frequency_type: p.frequency_type,
      frequency_value: p.frequency_value?.toString() ?? "",
      frequency_unit: p.frequency_unit ?? "months",
      estimated_hours: p.estimated_hours?.toString() ?? "",
      next_execution: p.next_execution?.slice(0, 10) ?? "",
      is_active: p.is_active,
    });
    setSaveError(null); setDialogOpen(true);
  }
  function handleClose() {
    setDialogOpen(false); setEditId(null); setForm(EMPTY); setSaveError(null);
  }
  function set<K extends keyof PlanForm>(k: K, v: PlanForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const data = {
        ...form,
        description:     form.description || undefined,
        equipment_id:    form.equipment_id || undefined,
        frequency_value: form.frequency_value ? Number(form.frequency_value) : undefined,
        frequency_unit:  form.frequency_unit || undefined,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
        next_execution:  form.next_execution || undefined,
      };
      if (editId) await callFn("tenant-maintenance-plans", { action: "update", id: editId, data });
      else        await callFn("tenant-maintenance-plans", { action: "create", data });
      invalidateCache("plans:list");
      await load(); handleClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "CODE_ALREADY_EXISTS") setSaveError("Ya existe un plan con ese código.");
      else setSaveError(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este plan de mantenimiento?")) return;
    setDeleting(id);
    try { await callFn("tenant-maintenance-plans", { action: "delete", id }); invalidateCache("plans:list"); await load(); }
    catch (e) { alert((e as Error).message); }
    finally { setDeleting(null); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <CalendarMonth color="primary" />
          <Typography variant="h5">Planes de Mantenimiento</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Nuevo plan</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Equipo</TableCell>
                <TableCell>Frecuencia</TableCell>
                <TableCell>Próxima ejecución</TableCell>
                <TableCell>Última ejecución</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No hay planes de mantenimiento. Crea el primero.</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{p.code}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
                    {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
                  </TableCell>
                  <TableCell>
                    {p.equipment_code
                      ? <><Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>{p.equipment_code}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.equipment_name}</Typography></>
                      : "—"}
                  </TableCell>
                  <TableCell><Typography variant="body2">{freqLabel(p)}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2"
                      sx={{ color: p.next_execution && new Date(p.next_execution) < new Date() ? "error.main" : "inherit" }}>
                      {fmtDate(p.next_execution)}
                    </Typography>
                  </TableCell>
                  <TableCell><Typography variant="body2">{fmtDate(p.last_execution)}</Typography></TableCell>
                  <TableCell>
                    <Chip label={p.is_active ? "Activo" : "Inactivo"}
                      color={p.is_active ? "success" : "default"} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(p)}><Edit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" disabled={deleting === p.id} onClick={() => handleDelete(p.id)}>
                        {deleting === p.id ? <CircularProgress size={14} /> : <Delete fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar plan" : "Nuevo plan de mantenimiento"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Código *" value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  required disabled={!!editId} sx={{ width: 160 }}
                  slotProps={{ htmlInput: { maxLength: 30 } }} />
                <TextField label="Nombre *" value={form.name}
                  onChange={(e) => set("name", e.target.value)} required fullWidth />
              </Box>
              <TextField label="Descripción" value={form.description}
                onChange={(e) => set("description", e.target.value)} multiline rows={2} fullWidth />
              <TextField label="Equipo" select value={form.equipment_id}
                onChange={(e) => set("equipment_id", e.target.value)} fullWidth>
                <MenuItem value="">— Sin equipo específico —</MenuItem>
                {equipment.map((eq) => (
                  <MenuItem key={eq.id} value={eq.id}>{eq.code} — {eq.name}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Tipo de frecuencia" select value={form.frequency_type}
                  onChange={(e) => set("frequency_type", e.target.value)} fullWidth>
                  <MenuItem value="calendar">Calendario</MenuItem>
                  <MenuItem value="usage">Por uso</MenuItem>
                </TextField>
                <TextField label="Cada" type="number" value={form.frequency_value}
                  onChange={(e) => set("frequency_value", e.target.value)}
                  sx={{ width: 100 }} slotProps={{ htmlInput: { min: 1 } }} />
                <TextField label="Unidad" select value={form.frequency_unit}
                  onChange={(e) => set("frequency_unit", e.target.value)} fullWidth>
                  <MenuItem value="days">Días</MenuItem>
                  <MenuItem value="weeks">Semanas</MenuItem>
                  <MenuItem value="months">Meses</MenuItem>
                  <MenuItem value="years">Años</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Horas estimadas" type="number" value={form.estimated_hours}
                  onChange={(e) => set("estimated_hours", e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.5 } }} fullWidth />
                <TextField label="Próxima ejecución" type="date" value={form.next_execution}
                  onChange={(e) => set("next_execution", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
              <FormControlLabel
                control={<Switch checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />}
                label="Plan activo" />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear plan"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
