import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, ToggleButtonGroup, ToggleButton,
} from "@mui/material";
import { Add, Refresh, Assignment, Edit, Delete, PlayArrow, CheckCircle, Lock, Inventory2 } from "@mui/icons-material";
import { callFn, callFnCached, invalidateCache } from "../lib/api";
import { supabase } from "../supabaseClient";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  description: string | null;
  work_order_type: string;
  priority: string;
  status: string;
  equipment_id: string | null;
  equipment_code: string | null;
  equipment_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  notes: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  materials_cost: number | null;
  created_at: string;
}

interface Equipment { id: string; code: string; name: string; }
interface TenantUser { auth_user_id: string; email: string; full_name: string | null; }
interface MaterialOpt { id: string; code: string; name: string; unit: string; stock_qty: number; unit_cost: number | null; }
interface WoMaterial { id: string; material_id: string; code: string; name: string; unit: string; qty: number; unit_cost: number; line_cost: number; }

interface WoForm {
  title: string; description: string;
  work_order_type: string; priority: string; status: string;
  equipment_id: string; assigned_to_user_id: string; assigned_to_name: string;
  planned_start: string; planned_end: string;
  estimated_hours: string; actual_hours: string; notes: string;
}

const EMPTY: WoForm = {
  title: "", description: "", work_order_type: "corrective",
  priority: "medium", status: "draft", equipment_id: "",
  assigned_to_user_id: "", assigned_to_name: "",
  planned_start: "", planned_end: "", estimated_hours: "", actual_hours: "", notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error" | "secondary"> = {
  draft: "default", planned: "info", released: "secondary", in_progress: "warning",
  completed: "success", closed: "success", canceled: "error",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", planned: "Planificada", released: "Liberada",
  in_progress: "En progreso", completed: "Completada", closed: "Cerrada", canceled: "Cancelada",
};
const PRIO_COLOR: Record<string, "default" | "info" | "warning" | "error"> = {
  low: "default", medium: "info", high: "warning", urgent: "error",
};
const PRIO_LABEL: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente",
};
const TYPE_LABEL: Record<string, string> = {
  corrective: "Correctivo", preventive: "Preventivo",
  predictive: "Predictivo", inspection: "Inspección",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<WoForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Flujo de cierre
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [completeWo, setCompleteWo] = useState<WorkOrder | null>(null);
  const [completeHours, setCompleteHours] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  // Materiales de la OT
  const [matWo, setMatWo] = useState<WorkOrder | null>(null);
  const [woMaterials, setWoMaterials] = useState<WoMaterial[]>([]);
  const [inventory, setInventory] = useState<MaterialOpt[]>([]);
  const [matLoading, setMatLoading] = useState(false);
  const [addMatId, setAddMatId] = useState("");
  const [addMatQty, setAddMatQty] = useState("");
  const [matBusy, setMatBusy] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, eqRes, usersRes] = await Promise.all([
        callFnCached<{ data: WorkOrder[] }>("tenant-work-orders", { action: "list" }, "work-orders:list"),
        callFnCached<{ data: Equipment[] }>("tenant-equipment", { action: "list" }, "equipment:list"),
        callFn<{ data: TenantUser[] }>("tenant-users", { action: "list" }).catch(() => ({ data: [] as TenantUser[] })),
      ]);
      setRows(woRes.data ?? []);
      setEquipment(eqRes.data ?? []);
      setUsers(usersRes.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setCurrentUserId(data.session.user.id);
    });
  }, [load]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(wo: WorkOrder) {
    setEditId(wo.id);
    setForm({
      title: wo.title, description: wo.description ?? "",
      work_order_type: wo.work_order_type, priority: wo.priority,
      status: wo.status, equipment_id: wo.equipment_id ?? "",
      assigned_to_user_id: wo.assigned_to_user_id ?? "",
      assigned_to_name: wo.assigned_to_name ?? "",
      planned_start: wo.planned_start?.slice(0, 16) ?? "",
      planned_end: wo.planned_end?.slice(0, 16) ?? "",
      estimated_hours: wo.estimated_hours?.toString() ?? "",
      actual_hours: wo.actual_hours?.toString() ?? "",
      notes: wo.notes ?? "",
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setEditId(null);
    setForm(EMPTY);
    setSaveError(null);
  }

  function set<K extends keyof WoForm>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      // Cuando se selecciona un técnico, sincronizar su nombre
      let assignedName = form.assigned_to_name;
      if (form.assigned_to_user_id) {
        const u = users.find((u) => u.auth_user_id === form.assigned_to_user_id);
        if (u) assignedName = u.full_name ?? u.email;
      }
      const data = {
        ...form,
        description:          form.description || undefined,
        equipment_id:         form.equipment_id || undefined,
        planned_start:        form.planned_start || undefined,
        planned_end:          form.planned_end || undefined,
        estimated_hours:      form.estimated_hours ? Number(form.estimated_hours) : undefined,
        actual_hours:         form.actual_hours ? Number(form.actual_hours) : undefined,
        notes:                form.notes || undefined,
        assigned_to_user_id:  form.assigned_to_user_id || undefined,
        assigned_to_name:     assignedName || undefined,
      };
      if (editId) {
        await callFn("tenant-work-orders", { action: "update", id: editId, data });
      } else {
        await callFn("tenant-work-orders", { action: "create", data });
      }
      invalidateCache("work-orders:list");
      await load();
      handleClose();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta orden de trabajo?")) return;
    setDeleting(id);
    try {
      await callFn("tenant-work-orders", { action: "delete", id });
      invalidateCache("work-orders:list");
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  // Transición rápida de estado (iniciar / cerrar / cancelar)
  async function transition(id: string, to: string, extra?: { actual_hours?: number; notes?: string }) {
    setTransitioning(id);
    try {
      await callFn("tenant-work-orders", { action: "transition", id, to, ...extra });
      invalidateCache("work-orders:list");
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTransitioning(null);
    }
  }

  function openComplete(wo: WorkOrder) {
    setCompleteWo(wo);
    setCompleteHours(wo.estimated_hours?.toString() ?? "");
    setCompleteNotes("");
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!completeWo) return;
    await transition(completeWo.id, "completed", {
      actual_hours: completeHours ? Number(completeHours) : undefined,
      notes: completeNotes || undefined,
    });
    setCompleteWo(null);
  }

  // ── Materiales de la OT ────────────────────────────────────────────────────
  async function openMaterials(wo: WorkOrder) {
    setMatWo(wo); setMatError(null); setAddMatId(""); setAddMatQty(""); setMatLoading(true);
    try {
      const [matRes, invRes] = await Promise.all([
        callFn<{ data: WoMaterial[] }>("tenant-work-orders", { action: "list_materials", id: wo.id }),
        callFnCached<{ data: MaterialOpt[] }>("tenant-inventory", { action: "list" }, "inventory:list"),
      ]);
      setWoMaterials(matRes.data ?? []);
      setInventory(invRes.data ?? []);
    } catch (e) { setMatError((e as Error).message); }
    finally { setMatLoading(false); }
  }

  async function refreshWoMaterials(woId: string) {
    const res = await callFn<{ data: WoMaterial[] }>("tenant-work-orders", { action: "list_materials", id: woId });
    setWoMaterials(res.data ?? []);
    invalidateCache("inventory:list");
    invalidateCache("work-orders:list");
  }

  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!matWo || !addMatId || !addMatQty) return;
    setMatBusy(true); setMatError(null);
    try {
      await callFn("tenant-work-orders", { action: "add_material", id: matWo.id, material_id: addMatId, qty: Number(addMatQty) });
      setAddMatId(""); setAddMatQty("");
      await refreshWoMaterials(matWo.id);
    } catch (e) {
      const msg = (e as Error).message;
      setMatError(msg === "INSUFFICIENT_STOCK" ? "Stock insuficiente para esa cantidad." : msg);
    } finally { setMatBusy(false); }
  }

  async function handleRemoveMaterial(woMaterialId: string) {
    if (!matWo) return;
    setMatBusy(true);
    try {
      await callFn("tenant-work-orders", { action: "remove_material", wo_material_id: woMaterialId });
      await refreshWoMaterials(matWo.id);
    } catch (e) { setMatError((e as Error).message); }
    finally { setMatBusy(false); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Assignment color="primary" />
          <Typography variant="h5">Órdenes de Trabajo</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Nueva OT
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={filterMode}
          onChange={(_, v) => { if (v) setFilterMode(v); }}>
          <ToggleButton value="all">Todas</ToggleButton>
          <ToggleButton value="mine">Mis OTs</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>OT #</TableCell>
                <TableCell>Título</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Prioridad</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Equipo</TableCell>
                <TableCell>Técnico</TableCell>
                <TableCell>Fecha planif.</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (filterMode === "mine"
                    ? rows.filter((r) => r.assigned_to_user_id === currentUserId)
                    : rows
                  ).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {filterMode === "mine" ? "No tienes OTs asignadas." : "No hay órdenes de trabajo. Crea la primera."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                (filterMode === "mine" ? rows.filter((r) => r.assigned_to_user_id === currentUserId) : rows).map((wo) => (
                  <TableRow key={wo.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {wo.wo_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{wo.title}</Typography>
                      {wo.description && (
                        <Typography variant="caption" color="text.secondary"
                          sx={{ display: "block", maxWidth: 220, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {wo.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{TYPE_LABEL[wo.work_order_type] ?? wo.work_order_type}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={PRIO_LABEL[wo.priority] ?? wo.priority}
                        color={PRIO_COLOR[wo.priority] ?? "default"} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={STATUS_LABEL[wo.status] ?? wo.status}
                        color={STATUS_COLOR[wo.status] ?? "default"} size="small" />
                    </TableCell>
                    <TableCell>
                      {wo.equipment_code ? (
                        <>
                          <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                            {wo.equipment_code}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{wo.equipment_name}</Typography>
                        </>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {wo.assigned_to_name ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>{fmt(wo.planned_start)}</TableCell>
                    <TableCell align="right">
                      {/* Flujo: iniciar (planned/released) → completar (in_progress) → cerrar (completed) */}
                      {transitioning === wo.id ? (
                        <CircularProgress size={16} sx={{ mx: 1 }} />
                      ) : (
                        <>
                          {(wo.status === "planned" || wo.status === "released" || wo.status === "draft") && (
                            <Tooltip title="Iniciar">
                              <IconButton size="small" color="warning" onClick={() => transition(wo.id, "in_progress")}>
                                <PlayArrow fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {wo.status === "in_progress" && (
                            <Tooltip title="Completar">
                              <IconButton size="small" color="success" onClick={() => openComplete(wo)}>
                                <CheckCircle fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {wo.status === "completed" && (
                            <Tooltip title="Cerrar">
                              <IconButton size="small" color="success" onClick={() => transition(wo.id, "closed")}>
                                <Lock fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </>
                      )}
                      <Tooltip title="Materiales / repuestos">
                        <IconButton size="small" onClick={() => openMaterials(wo)}><Inventory2 fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => openEdit(wo)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error"
                          disabled={deleting === wo.id}
                          onClick={() => handleDelete(wo.id)}>
                          {deleting === wo.id
                            ? <CircularProgress size={14} />
                            : <Delete fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar OT" : "Nueva orden de trabajo"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <TextField label="Título *" value={form.title}
                onChange={(e) => set("title", e.target.value)} required fullWidth />
              <TextField label="Descripción" value={form.description}
                onChange={(e) => set("description", e.target.value)} multiline rows={2} fullWidth />
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Tipo" select value={form.work_order_type}
                  onChange={(e) => set("work_order_type", e.target.value)} fullWidth>
                  <MenuItem value="corrective">Correctivo</MenuItem>
                  <MenuItem value="preventive">Preventivo</MenuItem>
                  <MenuItem value="predictive">Predictivo</MenuItem>
                  <MenuItem value="inspection">Inspección</MenuItem>
                </TextField>
                <TextField label="Prioridad" select value={form.priority}
                  onChange={(e) => set("priority", e.target.value)} fullWidth>
                  <MenuItem value="low">Baja</MenuItem>
                  <MenuItem value="medium">Media</MenuItem>
                  <MenuItem value="high">Alta</MenuItem>
                  <MenuItem value="urgent">Urgente</MenuItem>
                </TextField>
              </Box>
              <TextField label="Estado" select value={form.status}
                onChange={(e) => set("status", e.target.value)} fullWidth>
                <MenuItem value="draft">Borrador</MenuItem>
                <MenuItem value="planned">Planificada</MenuItem>
                <MenuItem value="released">Liberada</MenuItem>
                <MenuItem value="in_progress">En progreso</MenuItem>
                <MenuItem value="completed">Completada</MenuItem>
                <MenuItem value="closed">Cerrada</MenuItem>
                <MenuItem value="canceled">Cancelada</MenuItem>
              </TextField>
              <TextField label="Equipo" select value={form.equipment_id}
                onChange={(e) => set("equipment_id", e.target.value)} fullWidth>
                <MenuItem value="">— Sin equipo —</MenuItem>
                {equipment.map((eq) => (
                  <MenuItem key={eq.id} value={eq.id}>{eq.code} — {eq.name}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Inicio planificado" type="datetime-local" value={form.planned_start}
                  onChange={(e) => set("planned_start", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Fin planificado" type="datetime-local" value={form.planned_end}
                  onChange={(e) => set("planned_end", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
              <TextField label="Técnico asignado" select value={form.assigned_to_user_id}
                onChange={(e) => {
                  const uid = e.target.value;
                  set("assigned_to_user_id", uid);
                  const u = users.find((u) => u.auth_user_id === uid);
                  set("assigned_to_name", u ? (u.full_name ?? u.email) : "");
                }} fullWidth>
                <MenuItem value="">— Sin asignar —</MenuItem>
                {users.filter((u) => u.auth_user_id).map((u) => (
                  <MenuItem key={u.auth_user_id} value={u.auth_user_id}>
                    {u.full_name ?? u.email}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Horas estimadas" type="number" value={form.estimated_hours}
                  onChange={(e) => set("estimated_hours", e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.5 } }} fullWidth />
                <TextField label="Horas reales" type="number" value={form.actual_hours}
                  onChange={(e) => set("actual_hours", e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.5 } }} fullWidth />
              </Box>
              <TextField label="Notas" value={form.notes}
                onChange={(e) => set("notes", e.target.value)} multiline rows={2} fullWidth />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear OT"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ── Diálogo Completar OT ────────────────────────────────────────────── */}
      <Dialog open={!!completeWo} onClose={() => setCompleteWo(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CheckCircle color="success" fontSize="small" />
          Completar orden de trabajo
        </DialogTitle>
        <Box component="form" onSubmit={handleComplete}>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <strong>{completeWo?.wo_number}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{completeWo?.title}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Horas reales trabajadas" type="number" value={completeHours}
                onChange={(e) => setCompleteHours(e.target.value)} autoFocus
                slotProps={{ htmlInput: { min: 0, step: 0.5 } }} fullWidth />
              <TextField label="Notas de cierre" value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)} multiline rows={3} fullWidth
                placeholder="Trabajo realizado, repuestos usados, observaciones…" />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setCompleteWo(null)} disabled={transitioning === completeWo?.id}>Cancelar</Button>
            <Button type="submit" variant="contained" color="success"
              disabled={transitioning === completeWo?.id}
              startIcon={transitioning === completeWo?.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircle />}>
              Marcar completada
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ── Diálogo Materiales de la OT ─────────────────────────────────────── */}
      <Dialog open={!!matWo} onClose={() => setMatWo(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Inventory2 color="primary" fontSize="small" />
          Materiales — {matWo?.wo_number}
        </DialogTitle>
        <DialogContent>
          {matError && <Alert severity="error" sx={{ mb: 2 }}>{matError}</Alert>}

          {/* Form agregar consumo */}
          <Box component="form" onSubmit={handleAddMaterial} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", mb: 2 }}>
            <TextField label="Repuesto" select value={addMatId} onChange={(e) => setAddMatId(e.target.value)}
              required size="small" sx={{ flex: 1 }}>
              {inventory.map((m) => (
                <MenuItem key={m.id} value={m.id} disabled={m.stock_qty <= 0}>
                  {m.code} — {m.name} ({m.stock_qty} {m.unit})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Cant." type="number" value={addMatQty} onChange={(e) => setAddMatQty(e.target.value)}
              required size="small" sx={{ width: 90 }} slotProps={{ htmlInput: { min: 0, step: "any" } }} />
            <Button type="submit" variant="contained" disabled={matBusy} sx={{ mt: 0.25 }}
              startIcon={matBusy ? <CircularProgress size={14} color="inherit" /> : <Add />}>
              Agregar
            </Button>
          </Box>

          {matLoading ? <Skeleton variant="rectangular" height={120} /> : (
            woMaterials.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                Sin materiales consumidos. Agrega el primero arriba.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Repuesto</TableCell>
                    <TableCell align="right">Cant.</TableCell>
                    <TableCell align="right">Costo</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {woMaterials.map((wm) => (
                    <TableRow key={wm.id}>
                      <TableCell>
                        <Typography variant="body2">{wm.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{wm.code}</Typography>
                      </TableCell>
                      <TableCell align="right">{wm.qty} {wm.unit}</TableCell>
                      <TableCell align="right">S/ {Number(wm.line_cost).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="error" disabled={matBusy} onClick={() => handleRemoveMaterial(wm.id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Total materiales</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      S/ {woMaterials.reduce((s, w) => s + Number(w.line_cost), 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            )
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setMatWo(null); load(); }}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
