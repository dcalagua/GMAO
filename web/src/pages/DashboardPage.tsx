import { useEffect, useState } from "react";
import { Box, Grid, Card, CardContent, Typography, CircularProgress } from "@mui/material";
import { Business, CheckCircle, People, Pause } from "@mui/icons-material";
import { supabase } from "../supabaseClient";

interface Stats {
  total: number;
  active: number;
  trialing: number;
  suspended: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}

function StatCard({ title, value, icon, color, loading }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {loading ? <CircularProgress size={28} /> : value}
            </Typography>
          </Box>
          <Box sx={{ bgcolor: color, borderRadius: 2, p: 1.5, display: "flex",
                      alignItems: "center", justifyContent: "center", opacity: 0.85 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, trialing: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .schema("platform")
        .from("tenants")
        .select("status");
      if (data) {
        const rows = data as { status: string }[];
        setStats({
          total:     rows.length,
          active:    rows.filter((r) => r.status === "active").length,
          trialing:  rows.filter((r) => r.status === "trialing").length,
          suspended: rows.filter((r) => r.status === "suspended").length,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Dashboard</Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Total Tenants" value={stats.total}
            icon={<Business sx={{ color: "white" }} />} color="#5AA97F" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Activos" value={stats.active}
            icon={<CheckCircle sx={{ color: "white" }} />} color="#2196F3" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="En trial" value={stats.trialing}
            icon={<People sx={{ color: "white" }} />} color="#FF9800" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Suspendidos" value={stats.suspended}
            icon={<Pause sx={{ color: "white" }} />} color="#F44336" loading={loading} />
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Datos en tiempo real desde la plataforma.
        </Typography>
      </Box>
    </Box>
  );
}
