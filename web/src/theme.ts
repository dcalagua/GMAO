import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#5AA97F" },
    secondary: { main: "#2D6A4F" },
    background: { default: "#F4F6F8", paper: "#FFFFFF" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
      },
    },
  },
});
