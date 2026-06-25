import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton,
} from "@mui/material";
import { Add, Refresh, PrecisionManufacturing, Edit, Delete } from "@mui/icons-material";
import { callFn } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Equipment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  equipment_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  status: string;
  criticality: string;
  location_name: string | null;
  created_at: string;
}

interface EqForm {
  code: string; name: string; description: string;
  equipment_type: string; manufacturer: string; model: string;
  serial_number: string; install_date: string;
  status: string; criticality: string;
}

const EMPTY: EqForm = {
  code: "", name: "", description: "", equipment_type: "",
  manufacturer: "", model: "", serial_number: "",
  install_date: "", status: "active", criticality: "medium",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, "success" | "default" | "error"> = {
  active: "success", inactive: "default", scrapped: "error",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Activo", inactive: "Inactivo", scrapped: "Dado de baja",
};
const CRIT_COLOR: Record<string, "error" | "warning" | "info" | "default"> = {
  critical: "error", high: "warning", medium: "info", low: "default",
};
const CRIT_LABEL: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const [rows, setRows] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EqForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callFn<{ data: Equipment[] }>("tenant-equipment", { action: "list" });
      setRows(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditId(eq.id);
    setForm({
      code: eq.code, name: eq.name, description: eq.description ?? "",
      equipment_type: eq.equipment_type ?? "", manufacturer: eq.manufacturer ?? "",
      model: eq.model ?? "", serial_number: eq.serial_number ?? "",
      install_date: eq.install_date?.slice(0, 10) ?? "",
      status: eq.status, criticality: eq.criticality,
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

  function set<K extends keyof EqForm>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const data = {
        ...form,
        description:      form.description || undefined,
        equipment_type:   form.equipment_type || undefined,
        manufacturer:     form.manufacturer || undefined,
        model:            form.model || undefined,
        serial_number:    form.serial_number || undefined,
        install_date: form.install_date || undefined,
      };
      if (editId) {
        await callFn("tenant-equipment", { action: "update", id: editId, data });
      } else {
        await callFn("tenant-equipment", { action: "create", data });
      }
      await load();
      handleClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "CODE_ALREADY_EXISTS") setSaveError("Ya existe un equipo con ese código.");
      else setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este equipo?")) return;
    setDeleting(id);
    try {
      await callFn("tenant-equipment", { action: "delete", id });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <PrecisionManufacturing color="primary" />
          <Typography variant="h5">Equipos</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Nuevo equipo
          </Button>
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
                <TableCell>Tipo</TableCell>
                <TableCell>Fabricante / Modelo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Criticidad</TableCell>
                <TableCell>Alta</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      No hay equipos registrados. Crea el primero.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((eq) => (
                  <TableRow key={eq.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {eq.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{eq.name}</Typography>
                      {eq.location_name && (
                        <Typography variant="caption" color="text.secondary">{eq.location_name}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{eq.equipment_type ?? "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{eq.manufacturer ?? "—"}</Typography>
                      {eq.model && (
                        <Typography variant="caption" color="text.secondary">{eq.model}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={STATUS_LABEL[eq.status] ?? eq.status}
                        color={STATUS_COLOR[eq.status] ?? "default"} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={CRIT_LABEL[eq.criticality] ?? eq.criticality}
                        color={CRIT_COLOR[eq.criticality] ?? "default"} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{fmt(eq.created_at)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => openEdit(eq)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error"
                          disabled={deleting === eq.id}
                          onClick={() => handleDelete(eq.id)}>
                          {deleting === eq.id
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
        <DialogTitle>{editId ? "Editar equipo" : "Nuevo equipo"}</DialogTitle>
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
                  onChange={(e) => set("name", e.target.value)}
                  required fullWidth />
              </Box>
              <TextField label="Descripción" value={form.description}
                onChange={(e) => set("description", e.target.value)}
                multiline rows={2} fullWidth />
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Tipo de equipo" select value={form.equipment_type}
                  onChange={(e) => set("equipment_type", e.target.value)} fullWidth>
                  <MenuItem value="">— Seleccionar —</MenuItem>
                  <MenuItem value="rotating">Rotativo</MenuItem>
                  <MenuItem value="static">Estático</MenuItem>
                  <MenuItem value="electrical">Eléctrico</MenuItem>
                  <MenuItem value="instrumentation">Instrumentación</MenuItem>
                  <MenuItem value="civil">Civil</MenuItem>
                  <MenuItem value="hvac">HVAC</MenuItem>
                  <MenuItem value="it">TI / Informático</MenuItem>
                </TextField>
                <TextField label="Criticidad" select value={form.criticality}
                  onChange={(e) => set("criticality", e.target.value)} fullWidth>
                  <MenuItem value="low">Baja</MenuItem>
                  <MenuItem value="medium">Media</MenuItem>
                  <MenuItem value="high">Alta</MenuItem>
                  <MenuItem value="critical">Crítica</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Fabricante" value={form.manufacturer}
                  onChange={(e) => set("manufacturer", e.target.value)} fullWidth />
                <TextField label="Modelo" value={form.model}
                  onChange={(e) => set("model", e.target.value)} fullWidth />
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="N° de serie" value={form.serial_number}
                  onChange={(e) => set("serial_number", e.target.value)} fullWidth />
                <TextField label="Fecha instalación" type="date" value={form.install_date}
                  onChange={(e) => set("install_date", e.target.value)}
                  fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
              <TextField label="Estado" select value={form.status}
                onChange={(e) => set("status", e.target.value)} fullWidth>
                <MenuItem value="active">Activo</MenuItem>
                <MenuItem value="inactive">Inactivo</MenuItem>
                <MenuItem value="scrapped">Dado de baja</MenuItem>
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear equipo"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
