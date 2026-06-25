import { Box, Grid, Card, CardContent, Typography } from "@mui/material";
import { People, Business, CheckCircle, Pause } from "@mui/icons-material";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              bgcolor: color, borderRadius: 2, p: 1.5,
              display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.85,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Dashboard</Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Total Tenants" value="—"
            icon={<Business sx={{ color: "white" }} />} color="#5AA97F" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Activos" value="—"
            icon={<CheckCircle sx={{ color: "white" }} />} color="#2196F3" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="En trial" value="—"
            icon={<People sx={{ color: "white" }} />} color="#FF9800" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Suspendidos" value="—"
            icon={<Pause sx={{ color: "white" }} />} color="#F44336" />
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Los datos en tiempo real se conectarán en la siguiente iteración.
        </Typography>
      </Box>
    </Box>
  );
}
