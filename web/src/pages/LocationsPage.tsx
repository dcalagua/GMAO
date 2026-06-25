import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton,
} from "@mui/material";
import { Add, Refresh, AccountTree, Edit, Delete, SubdirectoryArrowRight } from "@mui/icons-material";
import { callFn, callFnCached, invalidateCache } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Location {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  level: number;
  is_active: boolean;
  sap_key: string | null;
  created_at: string;
}

interface LocForm {
  code: string; name: string; description: string;
  parent_id: string; sap_key: string; is_active: boolean;
}

const EMPTY: LocForm = { code: "", name: "", description: "", parent_id: "", sap_key: "", is_active: true };

const LEVEL_LABEL: Record<number, { label: string; color: "primary" | "secondary" | "info" | "warning" | "default" }> = {
  1: { label: "Planta",    color: "primary" },
  2: { label: "Área",      color: "secondary" },
  3: { label: "Sistema",   color: "info" },
  4: { label: "Subsistema",color: "warning" },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LocationsPage() {
  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LocForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await callFnCached<{ data: Location[] }>("tenant-locations", { action: "list" }, "locations:list");
      setRows(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate(parentId?: string) {
    setEditId(null);
    setForm({ ...EMPTY, parent_id: parentId ?? "" });
    setSaveError(null); setDialogOpen(true);
  }
  function openEdit(loc: Location) {
    setEditId(loc.id);
    setForm({
      code: loc.code, name: loc.name, description: loc.description ?? "",
      parent_id: loc.parent_id ?? "", sap_key: loc.sap_key ?? "", is_active: loc.is_active,
    });
    setSaveError(null); setDialogOpen(true);
  }
  function handleClose() { setDialogOpen(false); setEditId(null); setForm(EMPTY); setSaveError(null); }
  function set<K extends keyof LocForm>(k: K, v: LocForm[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const data = {
        ...form,
        description: form.description || undefined,
        parent_id:   form.parent_id || undefined,
        sap_key:     form.sap_key || undefined,
      };
      if (editId) await callFn("tenant-locations", { action: "update", id: editId, data });
      else        await callFn("tenant-locations", { action: "create", data });
      invalidateCache("locations:list");
      await load(); handleClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "CODE_ALREADY_EXISTS") setSaveError("Ya existe una ubicación con ese código.");
      else setSaveError(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta ubicación?")) return;
    setDeleting(id);
    try {
      await callFn("tenant-locations", { action: "delete", id });
      invalidateCache("locations:list");
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "HAS_CHILDREN") alert("No se puede eliminar: tiene ubicaciones hijas.");
      else if (msg === "HAS_EQUIPMENT") alert("No se puede eliminar: tiene equipos asociados.");
      else alert(msg);
    } finally { setDeleting(null); }
  }

  // solo ubicaciones que pueden ser padre (nivel < 4 y distinto al que editamos)
  const parentOptions = rows.filter((r) => r.level < 4 && r.id !== editId);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <AccountTree color="primary" />
          <Typography variant="h5">Ubicaciones Funcionales</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={() => openCreate()}>Nueva ubicación</Button>
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
                <TableCell>Padre</TableCell>
                <TableCell>Nivel</TableCell>
                <TableCell>Clave SAP</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      No hay ubicaciones. Empieza creando la planta raíz.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map((loc) => {
                const lvl = LEVEL_LABEL[loc.level] ?? { label: `Nivel ${loc.level}`, color: "default" as const };
                return (
                  <TableRow key={loc.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5,
                                  pl: (loc.level - 1) * 2 }}>
                        {loc.level > 1 && <SubdirectoryArrowRight sx={{ fontSize: 14, color: "text.disabled" }} />}
                        <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                          {loc.code}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{loc.name}</Typography>
                      {loc.description && <Typography variant="caption" color="text.secondary">{loc.description}</Typography>}
                    </TableCell>
                    <TableCell>
                      {loc.parent_code
                        ? <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                            {loc.parent_code} — {loc.parent_name}
                          </Typography>
                        : <Typography variant="caption" color="text.disabled">Raíz</Typography>}
                    </TableCell>
                    <TableCell>
                      <Chip label={lvl.label} color={lvl.color} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                        {loc.sap_key ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={loc.is_active ? "Activa" : "Inactiva"}
                        color={loc.is_active ? "success" : "default"} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Agregar hijo">
                        <IconButton size="small" onClick={() => openCreate(loc.id)}>
                          <Add fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => openEdit(loc)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error" disabled={deleting === loc.id}
                          onClick={() => handleDelete(loc.id)}>
                          {deleting === loc.id ? <CircularProgress size={14} /> : <Delete fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? "Editar ubicación" : "Nueva ubicación funcional"}</DialogTitle>
        <Box component="form" onSubmit={handleSave}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField label="Código *" value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  required disabled={!!editId} sx={{ width: 160 }}
                  slotProps={{ htmlInput: { maxLength: 50 } }} />
                <TextField label="Nombre *" value={form.name}
                  onChange={(e) => set("name", e.target.value)} required fullWidth />
              </Box>
              <TextField label="Descripción" value={form.description}
                onChange={(e) => set("description", e.target.value)} multiline rows={2} fullWidth />
              <TextField label="Ubicación padre" select value={form.parent_id}
                onChange={(e) => set("parent_id", e.target.value)}
                fullWidth disabled={!!editId}
                helperText={editId ? "El padre no se puede cambiar después de crear" : "Déjalo vacío para crear una planta raíz"}>
                <MenuItem value="">— Raíz (Planta) —</MenuItem>
                {parentOptions.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>
                    {"  ".repeat(loc.level - 1)}{loc.code} — {loc.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Clave SAP" value={form.sap_key}
                onChange={(e) => set("sap_key", e.target.value)} fullWidth
                slotProps={{ htmlInput: { maxLength: 50 } }} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear ubicación"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
