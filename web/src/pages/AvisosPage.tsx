import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, Snackbar,
} from "@mui/material";
import { Add, Refresh, ReportProblem, Edit, Delete, Transform } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { callFn, callFnCached, invalidateCache } from "../lib/api";

interface Aviso {
  id: string; code: string; notif_type: string; title: string; description: string | null;
  priority: string; status: string;
  equipment_id: string | null; equipment_code: string | null; equipment_name: string | null;
  functional_location_id: string | null; location_code: string | null; location_name: string | null;
  reported_by_name: string | null; work_order_id: string | null; wo_number: string | null;
  created_at: string;
}
interface Equipment { id: string; code: string; name: string; functional_location_id?: string | null; }
interface Location { id: string; code: string; name: string; level: number; }

interface Form {
  notif_type: string; title: string; description: string; priority: string;
  equipment_id: string; functional_location_id: string;
}
const EMPTY: Form = { notif_type: "M2", title: "", description: "", priority: "medium", equipment_id: "", functional_location_id: "" };

const TYPE_LABEL: Record<string, string> = { M1: "Solicitud", M2: "Avería", M3: "Actividad" };
const STATUS_LABEL: Record<string, string> = { open: "Abierto", in_review: "En revisión", converted: "Convertido", closed: "Cerrado" };
const STATUS_COLOR: Record<string, "warning" | "info" | "success" | "default"> = { open: "warning", in_review: "info", converted: "success", closed: "default" };
const PRIO_LABEL: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" };
const PRIO_COLOR: Record<string, "default" | "info" | "warning" | "error"> = { low: "default", medium: "info", high: "warning", urgent: "error" };

function fmt(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

export default function AvisosPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Aviso[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; wo: string }>({ open: false, wo: "" });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [avRes, eqRes, locRes] = await Promise.all([
        callFn<{ data: Aviso[] }>("tenant-avisos", { action: "list" }),
        callFnCached<{ data: Equipment[] }>("tenant-equipment", { action: "list" }, "equipment:list"),
        callFnCached<{ data: Location[] }>("tenant-locations", { action: "list" }, "locations:list"),
      ]);
      setRows(avRes.data ?? []);
      setEquipment(eqRes.data ?? []);
      setLocations(locRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // obtener rol desde tenant-settings get (que devuelve role)
  useEffect(() => {
    callFn<{ role: string }>("tenant-settings", { action: "get" }).then((r) => setRole(r.role)).catch(() => {});
  }, []);

  const canConvert = role === "owner" || role === "admin";

  function openCreate() { setEditId(null); setForm(EMPTY); setSaveError(null); setDialogOpen(true); }
  function openEdit(a: Aviso) {
    setEditId(a.id);
    setForm({ notif_type: a.notif_type, title: a.title, description: a.description ?? "", priority: a.priority,
      equipment_id: a.equipment_id ?? "", functional_location_id: a.functional_location_id ?? "" });
    setSaveError(null); setDialogOpen(true);
  }
  function set<K extends keyof Form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaveError(null);
    try {
      const data = { ...form, description: form.description || undefined,
        equipment_id: form.equipment_id || undefined, functional_location_id: form.functional_location_id || undefined };
      if (editId) await callFn("tenant-avisos", { action: "update", id: editId, data });
      else        await callFn("tenant-avisos", { action: "create", data });
      await load(); setDialogOpen(false);
    } catch (e) { setSaveError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este aviso?")) return;
    setDeleting(id);
    try { await callFn("tenant-avisos", { action: "delete", id }); await load(); }
    catch (e) { alert((e as Error).message); } finally { setDeleting(null); }
  }

  async function handleConvert(a: Aviso) {
    setConverting(a.id);
    try {
      const res = await callFn<{ wo_number: string }>("tenant-avisos", { action: "convert_to_wo", id: a.id });
      invalidateCache("work-orders:list");
      await load();
      setSnack({ open: true, wo: res.wo_number });
    } catch (e) {
      alert((e as Error).message);
    } finally { setConverting(null); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <ReportProblem color="primary" />
          <Typography variant="h5">Avisos de Mantenimiento</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar"><IconButton onClick={load} disabled={loading}><Refresh /></IconButton></Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Nuevo aviso</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell><TableCell>Tipo</TableCell><TableCell>Título</TableCell>
                <TableCell>Equipo / Ubicación</TableCell><TableCell>Prioridad</TableCell>
                <TableCell>Estado</TableCell><TableCell>Fecha</TableCell><TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No hay avisos. El técnico crea el primero al reportar una falla.</Typography>
                </TableCell></TableRow>
              ) : rows.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{a.code}</Typography></TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={TYPE_LABEL[a.notif_type] ?? a.notif_type} /></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{a.title}</Typography>
                    {a.wo_number && <Typography variant="caption" color="success.main">→ {a.wo_number}</Typography>}
                  </TableCell>
                  <TableCell>
                    {a.equipment_name && <Typography variant="body2">{a.equipment_code} — {a.equipment_name}</Typography>}
                    {a.location_name && <Typography variant="caption" color="text.secondary">{a.location_code} {a.location_name}</Typography>}
                    {!a.equipment_name && !a.location_name && "—"}
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={PRIO_LABEL[a.priority]} color={PRIO_COLOR[a.priority]} /></TableCell>
                  <TableCell><Chip size="small" label={STATUS_LABEL[a.status]} color={STATUS_COLOR[a.status]} /></TableCell>
                  <TableCell>{fmt(a.created_at)}</TableCell>
                  <TableCell align="right">
                    {a.status === "open" && canConvert && (
                      <Tooltip title="Convertir en OT">
                        <IconButton size="small" color="success" disabled={converting === a.id} onClick={() => handleConvert(a)}>
                          {converting === a.id ? <CircularProgress size={14} /> : <Transform fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {a.work_order_id && (
                      <Tooltip title="Ver OT">
                        <IconButton size="small" onClick={() => navigate("/work-orders")}><Transform fontSize="small" color="disabled" /></IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Editar"><IconButton size="small" onClick={() => openEdit(a)}><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" disabled={deleting === a.id} onClick={() => handleDelete(a.id)}>
                        {deleting === a.id ? <CircularProgress size={14} /> : <Delete fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Diálogo crear/editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar aviso" : "Nuevo aviso de mantenimiento"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Tipo" select value={form.notif_type} onChange={(e) => set("notif_type", e.target.value)} sx={{ width: 200 }}>
                  <MenuItem value="M1">M1 — Solicitud</MenuItem>
                  <MenuItem value="M2">M2 — Avería</MenuItem>
                  <MenuItem value="M3">M3 — Actividad</MenuItem>
                </TextField>
                <TextField label="Prioridad" select value={form.priority} onChange={(e) => set("priority", e.target.value)} fullWidth>
                  <MenuItem value="low">Baja</MenuItem><MenuItem value="medium">Media</MenuItem>
                  <MenuItem value="high">Alta</MenuItem><MenuItem value="urgent">Urgente</MenuItem>
                </TextField>
              </Box>
              <TextField label="Título *" value={form.title} onChange={(e) => set("title", e.target.value)} required fullWidth />
              <TextField label="Descripción de la falla" value={form.description} onChange={(e) => set("description", e.target.value)} multiline rows={3} fullWidth />
              <TextField label="Equipo" select value={form.equipment_id}
                onChange={(e) => {
                  const eq = equipment.find((x) => x.id === e.target.value);
                  set("equipment_id", e.target.value);
                  if (eq?.functional_location_id) set("functional_location_id", eq.functional_location_id);
                }} fullWidth>
                <MenuItem value="">— Sin equipo —</MenuItem>
                {equipment.map((eq) => <MenuItem key={eq.id} value={eq.id}>{eq.code} — {eq.name}</MenuItem>)}
              </TextField>
              <TextField label="Ubicación técnica" select value={form.functional_location_id} onChange={(e) => set("functional_location_id", e.target.value)} fullWidth>
                <MenuItem value="">— Sin ubicación —</MenuItem>
                {locations.map((l) => <MenuItem key={l.id} value={l.id}>{"  ".repeat(l.level - 1)}{l.code} — {l.name}</MenuItem>)}
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar" : "Crear aviso"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={7000} onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={`OT creada desde el aviso: ${snack.wo}`}
        action={<Button color="inherit" size="small" onClick={() => navigate("/work-orders")}>Ver OTs</Button>} />
    </Box>
  );
}
