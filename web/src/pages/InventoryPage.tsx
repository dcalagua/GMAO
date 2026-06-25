import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, ToggleButtonGroup, ToggleButton,
} from "@mui/material";
import {
  Add, Refresh, Inventory2, Edit, Delete, SwapVert, History, Warning,
} from "@mui/icons-material";
import { callFn, callFnCached, invalidateCache } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Material {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  stock_qty: number;
  min_stock: number;
  max_stock: number | null;
  unit_cost: number | null;
  warehouse: string | null;
  low_stock: boolean;
  out_of_stock: boolean;
}

interface Movement {
  id: string; movement_type: string; qty: number;
  balance_after: number; reason: string | null; created_at: string;
}

interface MatForm {
  code: string; name: string; description: string; unit: string;
  stock_qty: string; min_stock: string; max_stock: string;
  unit_cost: string; warehouse: string;
}

const EMPTY: MatForm = {
  code: "", name: "", description: "", unit: "unidad",
  stock_qty: "", min_stock: "", max_stock: "", unit_cost: "", warehouse: "",
};

const UNITS = ["unidad", "pieza", "metro", "litro", "kg", "galón", "rollo", "caja", "juego"];

const MOV_LABEL: Record<string, string> = { in: "Entrada", out: "Salida", adjustment: "Ajuste" };
const MOV_COLOR: Record<string, "success" | "error" | "info"> = { in: "success", out: "error", adjustment: "info" };

function money(n: number | null) {
  if (n == null) return "—";
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MatForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Ajuste de stock
  const [adjustMat, setAdjustMat] = useState<Material | null>(null);
  const [adjType, setAdjType] = useState<"in" | "out" | "adjustment">("in");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  // Movimientos
  const [movMat, setMovMat] = useState<Material | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await callFnCached<{ data: Material[] }>("tenant-inventory", { action: "list" }, "inventory:list");
      setRows(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditId(null); setForm(EMPTY); setSaveError(null); setDialogOpen(true); }
  function openEdit(m: Material) {
    setEditId(m.id);
    setForm({
      code: m.code, name: m.name, description: m.description ?? "", unit: m.unit,
      stock_qty: m.stock_qty.toString(), min_stock: m.min_stock.toString(),
      max_stock: m.max_stock?.toString() ?? "", unit_cost: m.unit_cost?.toString() ?? "",
      warehouse: m.warehouse ?? "",
    });
    setSaveError(null); setDialogOpen(true);
  }
  function set<K extends keyof MatForm>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const data = {
        code: form.code, name: form.name,
        description: form.description || undefined,
        unit: form.unit,
        stock_qty: form.stock_qty ? Number(form.stock_qty) : 0,
        min_stock: form.min_stock ? Number(form.min_stock) : 0,
        max_stock: form.max_stock ? Number(form.max_stock) : undefined,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
        warehouse: form.warehouse || undefined,
      };
      if (editId) await callFn("tenant-inventory", { action: "update", id: editId, data });
      else        await callFn("tenant-inventory", { action: "create", data });
      invalidateCache("inventory:list");
      await load(); setDialogOpen(false);
    } catch (e) {
      const msg = (e as Error).message;
      setSaveError(msg === "CODE_ALREADY_EXISTS" ? "Ya existe un repuesto con ese código." : msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este repuesto?")) return;
    setDeleting(id);
    try { await callFn("tenant-inventory", { action: "delete", id }); invalidateCache("inventory:list"); await load(); }
    catch (e) { alert((e as Error).message); }
    finally { setDeleting(null); }
  }

  function openAdjust(m: Material) {
    setAdjustMat(m); setAdjType("in"); setAdjQty(""); setAdjReason(""); setAdjError(null);
  }
  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustMat) return;
    setAdjusting(true); setAdjError(null);
    try {
      await callFn("tenant-inventory", {
        action: "adjust", id: adjustMat.id, movement_type: adjType,
        qty: Number(adjQty), reason: adjReason || undefined,
      });
      invalidateCache("inventory:list");
      await load(); setAdjustMat(null);
    } catch (e) {
      const msg = (e as Error).message;
      setAdjError(msg === "INSUFFICIENT_STOCK" ? "Stock insuficiente para esa salida." : msg);
    } finally { setAdjusting(false); }
  }

  async function openMovements(m: Material) {
    setMovMat(m); setMovLoading(true); setMovements([]);
    try {
      const res = await callFn<{ data: Movement[] }>("tenant-inventory", { action: "movements", id: m.id });
      setMovements(res.data ?? []);
    } catch { /* */ }
    finally { setMovLoading(false); }
  }

  const lowCount = rows.filter((r) => r.low_stock || r.out_of_stock).length;
  const totalValue = rows.reduce((s, r) => s + (r.unit_cost ?? 0) * r.stock_qty, 0);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Inventory2 color="primary" />
          <Typography variant="h5">Inventario / Repuestos</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar"><IconButton onClick={load} disabled={loading}><Refresh /></IconButton></Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Nuevo repuesto</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && lowCount > 0 && (
        <Alert severity="warning" icon={<Warning />} sx={{ mb: 2 }}>
          {lowCount} repuesto(s) con stock bajo o agotado.
        </Alert>
      )}
      {!loading && rows.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Valor total del inventario: <strong>{money(totalValue)}</strong>
        </Typography>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Repuesto</TableCell>
                <TableCell>Almacén</TableCell>
                <TableCell align="right">Stock</TableCell>
                <TableCell align="right">Mín.</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Costo unit.</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No hay repuestos registrados. Crea el primero.</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{m.code}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography>
                    {m.description && <Typography variant="caption" color="text.secondary">{m.description}</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="body2">{m.warehouse ?? "—"}</Typography></TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {m.stock_qty} <Typography component="span" variant="caption" color="text.secondary">{m.unit}</Typography>
                    </Typography>
                  </TableCell>
                  <TableCell align="right"><Typography variant="body2" color="text.secondary">{m.min_stock}</Typography></TableCell>
                  <TableCell>
                    {m.out_of_stock
                      ? <Chip label="Agotado" color="error" size="small" />
                      : m.low_stock
                        ? <Chip label="Stock bajo" color="warning" size="small" />
                        : <Chip label="OK" color="success" size="small" variant="outlined" />}
                  </TableCell>
                  <TableCell align="right"><Typography variant="body2">{money(m.unit_cost)}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Movimiento de stock">
                      <IconButton size="small" color="primary" onClick={() => openAdjust(m)}><SwapVert fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Historial">
                      <IconButton size="small" onClick={() => openMovements(m)}><History fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(m)}><Edit fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" disabled={deleting === m.id} onClick={() => handleDelete(m.id)}>
                        {deleting === m.id ? <CircularProgress size={14} /> : <Delete fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo crear/editar ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar repuesto" : "Nuevo repuesto"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Código *" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())}
                  required disabled={!!editId} sx={{ width: 180 }} slotProps={{ htmlInput: { maxLength: 40 } }} />
                <TextField label="Nombre *" value={form.name} onChange={(e) => set("name", e.target.value)} required fullWidth />
              </Box>
              <TextField label="Descripción" value={form.description} onChange={(e) => set("description", e.target.value)} fullWidth />
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Unidad" select value={form.unit} onChange={(e) => set("unit", e.target.value)} sx={{ width: 160 }}>
                  {UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </TextField>
                <TextField label="Almacén" value={form.warehouse} onChange={(e) => set("warehouse", e.target.value)} fullWidth />
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label={editId ? "Stock actual" : "Stock inicial"} type="number" value={form.stock_qty}
                  onChange={(e) => set("stock_qty", e.target.value)} disabled={!!editId}
                  helperText={editId ? "Usa 'Movimiento' para cambiar el stock" : undefined}
                  slotProps={{ htmlInput: { min: 0, step: "any" } }} fullWidth />
                <TextField label="Stock mínimo" type="number" value={form.min_stock}
                  onChange={(e) => set("min_stock", e.target.value)} slotProps={{ htmlInput: { min: 0, step: "any" } }} fullWidth />
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Stock máximo" type="number" value={form.max_stock}
                  onChange={(e) => set("max_stock", e.target.value)} slotProps={{ htmlInput: { min: 0, step: "any" } }} fullWidth />
                <TextField label="Costo unitario (S/)" type="number" value={form.unit_cost}
                  onChange={(e) => set("unit_cost", e.target.value)} slotProps={{ htmlInput: { min: 0, step: "0.01" } }} fullWidth />
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear repuesto"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ── Diálogo ajuste de stock ─────────────────────────────────────────── */}
      <Dialog open={!!adjustMat} onClose={() => setAdjustMat(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SwapVert color="primary" fontSize="small" /> Movimiento de stock
        </DialogTitle>
        <Box component="form" onSubmit={handleAdjust}>
          <DialogContent>
            {adjError && <Alert severity="error" sx={{ mb: 2 }}>{adjError}</Alert>}
            <Typography variant="body2" sx={{ mb: 0.5 }}><strong>{adjustMat?.code}</strong> — {adjustMat?.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Stock actual: {adjustMat?.stock_qty} {adjustMat?.unit}
            </Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={adjType}
              onChange={(_, v) => { if (v) setAdjType(v); }} sx={{ mb: 2 }}>
              <ToggleButton value="in" color="success">Entrada</ToggleButton>
              <ToggleButton value="out" color="error">Salida</ToggleButton>
              <ToggleButton value="adjustment" color="info">Ajuste</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              label={adjType === "adjustment" ? "Stock contado (nuevo total)" : "Cantidad"} type="number"
              value={adjQty} onChange={(e) => setAdjQty(e.target.value)} required autoFocus fullWidth
              slotProps={{ htmlInput: { min: 0, step: "any" } }} sx={{ mb: 2 }} />
            <TextField label="Motivo / referencia" value={adjReason} onChange={(e) => setAdjReason(e.target.value)}
              fullWidth placeholder={adjType === "out" ? "OT, consumo, merma…" : "Compra, devolución, conteo…"} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setAdjustMat(null)} disabled={adjusting}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={adjusting}
              startIcon={adjusting ? <CircularProgress size={16} color="inherit" /> : <SwapVert />}>
              Registrar
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ── Diálogo historial de movimientos ────────────────────────────────── */}
      <Dialog open={!!movMat} onClose={() => setMovMat(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <History color="primary" fontSize="small" /> Movimientos — {movMat?.name}
        </DialogTitle>
        <DialogContent>
          {movLoading ? <Skeleton variant="rectangular" height={160} /> : (
            movements.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Sin movimientos registrados.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell><TableCell>Tipo</TableCell>
                    <TableCell align="right">Cantidad</TableCell><TableCell align="right">Saldo</TableCell>
                    <TableCell>Motivo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movements.map((mv) => (
                    <TableRow key={mv.id}>
                      <TableCell><Typography variant="caption">{fmtDateTime(mv.created_at)}</Typography></TableCell>
                      <TableCell><Chip size="small" label={MOV_LABEL[mv.movement_type]} color={MOV_COLOR[mv.movement_type]} variant="outlined" /></TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: mv.qty < 0 ? "error.main" : "success.main", fontWeight: 600 }}>
                          {mv.qty > 0 ? "+" : ""}{mv.qty}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{mv.balance_after}</TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary">{mv.reason ?? "—"}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMovMat(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
