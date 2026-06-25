import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/Layout/AppLayout";
import TenantsPage from "./pages/TenantsPage";
import DashboardPage from "./pages/DashboardPage";
import LocationsPage from "./pages/LocationsPage";
import ReportsPage from "./pages/ReportsPage";
import EquipmentPage from "./pages/EquipmentPage";
import WorkOrdersPage from "./pages/WorkOrdersPage";
import MaintenancePlansPage from "./pages/MaintenancePlansPage";
import { CircularProgress, Box } from "@mui/material";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout session={session} />}>
        <Route path="/" element={<Navigate to="/tenants" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/work-orders" element={<WorkOrdersPage />} />
        <Route path="/maintenance-plans" element={<MaintenancePlansPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
