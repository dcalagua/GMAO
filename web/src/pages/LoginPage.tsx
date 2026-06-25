import { useState } from "react";
import {
  Box, Card, CardContent, TextField, Button,
  Typography, Alert, InputAdornment, IconButton, Divider,
} from "@mui/material";
import { Visibility, VisibilityOff, Build } from "@mui/icons-material";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2D6A4F 0%, #5AA97F 100%)",
      }}
    >
      <Card sx={{ width: 400, mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
            <Box
              sx={{
                bgcolor: "primary.main",
                borderRadius: 2,
                p: 0.8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Build sx={{ color: "white", fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" color="primary.dark" sx={{ lineHeight: 1 }}>
                GMAO
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Platform Admin
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Accede con tu cuenta de administrador de plataforma.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box
            component="form"
            onSubmit={handleLogin}
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <TextField
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required fullWidth autoComplete="email"
            />
            <TextField
              label="Contraseña"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required fullWidth autoComplete="current-password"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPwd((v) => !v)} edge="end">
                        {showPwd ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              fullWidth
              sx={{ mt: 1 }}
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
