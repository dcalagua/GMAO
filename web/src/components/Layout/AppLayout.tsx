import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  Box, Drawer, AppBar, Toolbar, Typography, List, ListItemButton,
  ListItemIcon, ListItemText, IconButton, Avatar, Menu, MenuItem,
  Divider, Tooltip, useTheme, useMediaQuery,
} from "@mui/material";
import {
  Dashboard, Business, Menu as MenuIcon, Build,
  ChevronLeft, Logout, Person, PrecisionManufacturing, Assignment,
  CalendarMonth, AccountTree, Assessment, People, Settings, Inventory2, Hub, ReportProblem,
} from "@mui/icons-material";
import { Divider as MuiDivider } from "@mui/material";
import { supabase } from "../../supabaseClient";
import { preloadGmao } from "../../lib/api";
import NotificationBell from "../NotificationBell";

const DRAWER_WIDTH = 240;

const NAV_HOME = [
  { label: "Dashboard", path: "/dashboard", icon: <Dashboard /> },
];

const NAV_PLATFORM = [
  { label: "Tenants", path: "/tenants", icon: <Business /> },
];

const NAV_GMAO = [
  { label: "Ubicaciones",        path: "/locations",         icon: <AccountTree /> },
  { label: "Equipos",            path: "/equipment",         icon: <PrecisionManufacturing /> },
  { label: "Avisos",             path: "/avisos",            icon: <ReportProblem /> },
  { label: "Órdenes de Trabajo", path: "/work-orders",       icon: <Assignment /> },
  { label: "Planes de Mant.",    path: "/maintenance-plans", icon: <CalendarMonth /> },
  { label: "Inventario",         path: "/inventory",         icon: <Inventory2 /> },
  { label: "Reportes",           path: "/reports",           icon: <Assessment /> },
  { label: "Usuarios",           path: "/users",             icon: <People /> },
  { label: "Integraciones",      path: "/integrations",      icon: <Hub /> },
  { label: "Configuración",      path: "/settings",          icon: <Settings /> },
];

interface AppLayoutProps {
  session: Session;
}

export default function AppLayout({ session }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    preloadGmao();
    // Detectar si el usuario es administrador de la plataforma
    supabase.schema("platform").from("admin_users")
      .select("auth_user_id").eq("auth_user_id", session.user.id).maybeSingle()
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [session.user.id]);

  const userEmail = session.user.email ?? "";
  const userInitial = userEmail.charAt(0).toUpperCase();

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const drawer = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header del drawer */}
      <Box
        sx={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ bgcolor: "primary.main", borderRadius: 1.5, p: 0.5, display: "flex" }}>
            <Build sx={{ color: "white", fontSize: 20 }} />
          </Box>
          <Typography variant="h6" color="primary.dark">GMAO</Typography>
        </Box>
        {isMobile && (
          <IconButton onClick={() => setDrawerOpen(false)} size="small">
            <ChevronLeft />
          </IconButton>
        )}
      </Box>

      {/* Navegación */}
      <List sx={{ flex: 1, pt: 1 }}>
        {NAV_HOME.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              onClick={() => { navigate(item.path); if (isMobile) setDrawerOpen(false); }}
              selected={active}
              sx={{
                mx: 1, borderRadius: 2, mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "primary.main", color: "white",
                  "& .MuiListItemIcon-root": { color: "white" },
                  "&:hover": { bgcolor: "primary.dark" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}

        {isPlatformAdmin && <MuiDivider sx={{ mx: 2, my: 1 }} />}
        {isPlatformAdmin && (
          <Typography variant="caption" color="text.disabled"
            sx={{ px: 3, pb: 0.5, display: "block", textTransform: "uppercase", letterSpacing: 1 }}>
            Plataforma
          </Typography>
        )}
        {isPlatformAdmin && NAV_PLATFORM.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              onClick={() => { navigate(item.path); if (isMobile) setDrawerOpen(false); }}
              selected={active}
              sx={{
                mx: 1, borderRadius: 2, mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "primary.main", color: "white",
                  "& .MuiListItemIcon-root": { color: "white" },
                  "&:hover": { bgcolor: "primary.dark" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}

        <MuiDivider sx={{ mx: 2, my: 1 }} />
        <Typography variant="caption" color="text.disabled"
          sx={{ px: 3, pb: 0.5, display: "block", textTransform: "uppercase", letterSpacing: 1 }}>
          GMAO
        </Typography>

        {NAV_GMAO.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              onClick={() => { navigate(item.path); if (isMobile) setDrawerOpen(false); }}
              selected={active}
              sx={{
                mx: 1, borderRadius: 2, mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "primary.main", color: "white",
                  "& .MuiListItemIcon-root": { color: "white" },
                  "&:hover": { bgcolor: "primary.dark" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>

      {/* Footer del drawer */}
      <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {userEmail}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: "white",
          borderBottom: "1px solid",
          borderColor: "divider",
          color: "text.primary",
          width: { md: drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : "100%" },
          ml: { md: drawerOpen ? `${DRAWER_WIDTH}px` : 0 },
          transition: "width 0.2s, margin-left 0.2s",
        }}
      >
        <Toolbar>
          <IconButton edge="start" onClick={() => setDrawerOpen((v) => !v)} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {isPlatformAdmin ? "Platform Admin" : "GMAO"}
          </Typography>

          <NotificationBell />

          <Tooltip title="Cuenta">
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ bgcolor: "primary.main", width: 34, height: 34, fontSize: 14 }}>
                {userInitial}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            <MenuItem disabled>
              <Person fontSize="small" sx={{ mr: 1 }} />
              {userEmail}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <Logout fontSize="small" sx={{ mr: 1 }} />
              Cerrar sesión
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant={isMobile ? "temporary" : "persistent"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width: DRAWER_WIDTH, flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        {drawer}
      </Drawer>

      {/* Contenido */}
      <Box
        component="main"
        sx={{
          flex: 1, p: 3, mt: "64px",
          bgcolor: "background.default",
          minHeight: "calc(100vh - 64px)",
          transition: "margin-left 0.2s",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
