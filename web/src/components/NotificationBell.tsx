import { useState, useEffect, useCallback } from "react";
import {
  IconButton, Badge, Menu, Box, Typography, Divider, Button,
  List, ListItemButton, ListItemText, Tooltip, CircularProgress,
} from "@mui/material";
import {
  Notifications, NotificationsNone, DoneAll,
  Assignment, AutoMode, Warning, Circle,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { callFn } from "../lib/api";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  wo_assigned: <Assignment fontSize="small" color="warning" />,
  wo_generated: <AutoMode fontSize="small" color="info" />,
  plan_overdue: <Warning fontSize="small" color="error" />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await callFn<{ data: Notif[]; unread: number }>("tenant-notifications", { action: "list" });
      setItems(res.data ?? []);
      setUnread(res.unread ?? 0);
    } catch { /* silencioso */ }
  }, []);

  // Poll cada 60s + al montar
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function openMenu(e: React.MouseEvent<HTMLElement>) {
    setAnchorEl(e.currentTarget);
    setLoading(true);
    await load();
    setLoading(false);
  }

  async function handleClick(n: Notif) {
    if (!n.is_read) {
      await callFn("tenant-notifications", { action: "mark_read", id: n.id }).catch(() => {});
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread((u) => Math.max(0, u - 1));
    }
    setAnchorEl(null);
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await callFn("tenant-notifications", { action: "mark_all_read" }).catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  }

  return (
    <>
      <Tooltip title="Notificaciones">
        <IconButton onClick={openMenu}>
          <Badge badgeContent={unread} color="error">
            {unread > 0 ? <Notifications /> : <NotificationsNone />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 480 } } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Notificaciones</Typography>
          {unread > 0 && (
            <Button size="small" startIcon={<DoneAll fontSize="small" />} onClick={markAll}>
              Marcar leídas
            </Button>
          )}
        </Box>
        <Divider />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><CircularProgress size={22} /></Box>
        ) : items.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <NotificationsNone sx={{ fontSize: 36, color: "text.disabled" }} />
            <Typography variant="body2" color="text.secondary">Sin notificaciones</Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {items.map((n) => (
              <ListItemButton key={n.id} onClick={() => handleClick(n)}
                sx={{ alignItems: "flex-start", gap: 1, bgcolor: n.is_read ? "transparent" : "action.hover" }}>
                <Box sx={{ mt: 0.5 }}>{TYPE_ICON[n.type] ?? <Circle fontSize="small" />}</Box>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title}</Typography>
                      {!n.is_read && <Circle sx={{ fontSize: 8, color: "primary.main", flexShrink: 0 }} />}
                    </Box>
                  }
                  secondary={
                    <>
                      {n.body && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{n.body}</Typography>}
                      <Typography variant="caption" color="text.disabled">{timeAgo(n.created_at)}</Typography>
                    </>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Menu>
    </>
  );
}
