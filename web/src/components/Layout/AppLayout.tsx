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
  ChevronLeft, Logout, Person, PrecisionManufacturing, Assignment, CalendarMonth, AccountTree,
} from "@mui/icons-material";
import { Divider as MuiDivider } from "@mui/material";
import { supabase } from "../../supabaseClient";
import { preloadGmao } from "../../lib/api";

const DRAWER_WIDTH = 240;

const NAV_PLATFORM = [
  { label: "Dashboard", path: "/dashboard", icon: <Dashboard /> },
  { label: "Tenants", path: "/tenants", icon: <Business /> },
];

const NAV_GMAO = [
  { label: "Ubicaciones",        path: "/locations",         icon: <AccountTree /> },
  { label: "Equipos",            path: "/equipment",         icon: <PrecisionManufacturing /> },
  { label: "Órdenes de Trabajo", path: "/work-orders",       icon: <Assignment /> },
  { label: "Planes de Mant.",    path: "/maintenance-plans", icon: <CalendarMonth /> },
];

interface AppLayoutProps {
  session: Session;
}

export default function AppLayout({ session }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  useEffect(() => { preloadGmao(); }, []);

  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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
        {NAV_PLATFORM.map((item) => {
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
          <Typography variant="h6" sx={{ flex: 1 }}>Platform Admin</Typography>

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
