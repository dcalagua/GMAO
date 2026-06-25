import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, Tooltip, CircularProgress, Skeleton, Avatar,
} from "@mui/material";
import { Add, Refresh, People, Delete, Edit } from "@mui/icons-material";
import { callFn } from "../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TenantUser {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  last_sign_in_at: string | null;
  invited_at: string | null;
  created_at: string;
}

const ROLE_COLOR: Record<string, "error" | "warning" | "info" | "default"> = {
  admin: "error", technician: "warning", viewer: "info",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", technician: "Técnico", viewer: "Lector",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(email: string, name: string | null) {
  if (name) return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [rows, setRows] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState<TenantUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("technician");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await callFn<{ data: TenantUser[] }>("tenant-users", { action: "list" });
      setRows(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      await callFn("tenant-users", { action: "invite", email: inviteEmail, role: inviteRole });
      await load();
      setInviteOpen(false); setInviteEmail(""); setInviteRole("technician");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally { setSaving(false); }
  }

  async function handleRoleChange(user: TenantUser, newRole: string) {
    setSaving(true); setSaveError(null);
    try {
      await callFn("tenant-users", { action: "update_role", user_id: user.auth_user_id, role: newRole });
      await load(); setRoleOpen(null);
    } catch (e) { setSaveError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleRemove(user: TenantUser) {
    if (!confirm(`¿Desactivar a ${user.email}?`)) return;
    setRemoving(user.auth_user_id);
    try { await callFn("tenant-users", { action: "remove", user_id: user.auth_user_id }); await load(); }
    catch (e) { alert((e as Error).message); }
    finally { setRemoving(null); }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <People color="primary" />
          <Typography variant="h5">Usuarios del Tenant</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Recargar">
            <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setSaveError(null); setInviteOpen(true); }}>
            Invitar usuario
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Usuario</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Último acceso</TableCell>
                <TableCell>Invitado</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">No hay usuarios. Invita al primero.</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: "primary.main" }}>
                        {initials(u.email, u.full_name)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {u.full_name ?? u.email}
                        </Typography>
                        {u.full_name && (
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={ROLE_LABEL[u.role] ?? u.role}
                      color={ROLE_COLOR[u.role] ?? "default"} size="small" />
                  </TableCell>
                  <TableCell><Typography variant="body2">{fmtDate(u.last_sign_in_at)}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{fmtDate(u.invited_at)}</Typography></TableCell>
                  <TableCell>
                    <Chip label={u.is_active ? "Activo" : "Inactivo"}
                      color={u.is_active ? "success" : "default"} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Cambiar rol">
                      <IconButton size="small" onClick={() => { setSaveError(null); setRoleOpen(u); }}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Desactivar">
                      <IconButton size="small" color="error" disabled={removing === u.auth_user_id}
                        onClick={() => handleRemove(u)}>
                        {removing === u.auth_user_id ? <CircularProgress size={14} /> : <Delete fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── Diálogo Invitar ──────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invitar usuario</DialogTitle>
        <Box component="form" onSubmit={handleInvite}>
          <DialogContent>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
              El usuario recibirá un correo de invitación para establecer su contraseña.
            </Alert>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Correo electrónico *" type="email" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} required fullWidth autoFocus />
              <TextField label="Rol" select value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)} fullWidth>
                <MenuItem value="admin">Administrador — acceso completo</MenuItem>
                <MenuItem value="technician">Técnico — gestión de OTs y equipos</MenuItem>
                <MenuItem value="viewer">Lector — solo visualización</MenuItem>
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setInviteOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Add />}>
              {saving ? "Enviando invitación…" : "Enviar invitación"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ── Diálogo Cambiar Rol ──────────────────────────────────────────────── */}
      <Dialog open={!!roleOpen} onClose={() => setRoleOpen(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar rol de {roleOpen?.email}</DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
            {["admin", "technician", "viewer"].map((r) => (
              <Button key={r} variant={roleOpen?.role === r ? "contained" : "outlined"}
                onClick={() => roleOpen && handleRoleChange(roleOpen, r)} disabled={saving}
                fullWidth sx={{ justifyContent: "flex-start", textTransform: "none" }}>
                {ROLE_LABEL[r]}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setRoleOpen(null)}>Cancelar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
