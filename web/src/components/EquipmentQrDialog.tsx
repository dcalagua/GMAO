import { Dialog, DialogContent, DialogActions, Button, Box, Typography } from "@mui/material";
import { Print, Close } from "@mui/icons-material";
import { QRCodeCanvas } from "qrcode.react";

interface Props {
  open: boolean;
  onClose: () => void;
  equipment: { code: string; name: string; location_name?: string | null } | null;
}

export default function EquipmentQrDialog({ open, onClose, equipment }: Props) {
  if (!equipment) return null;
  const eq = equipment;

  // URL profunda: al escanear abre la ficha del equipo en el GMAO
  const url = `${window.location.origin}/equipment?code=${encodeURIComponent(eq.code)}`;

  function handlePrint() {
    const canvas = document.getElementById("equipment-qr") as HTMLCanvasElement | null;
    const dataUrl = canvas?.toDataURL("image/png") ?? "";
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    w.document.write(`
      <html><head><title>QR ${eq.code}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 32px; }
        img { width: 260px; height: 260px; }
        .code { font-family: monospace; font-size: 22px; font-weight: bold; margin-top: 12px; }
        .name { font-size: 16px; color: #333; margin-top: 4px; }
        .loc { font-size: 13px; color: #777; margin-top: 4px; }
      </style></head>
      <body>
        <img src="${dataUrl}" />
        <div class="code">${eq.code}</div>
        <div class="name">${eq.name}</div>
        ${eq.location_name ? `<div class="loc">${eq.location_name}</div>` : ""}
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs">
      <DialogContent sx={{ textAlign: "center", pt: 4 }}>
        <Box sx={{ display: "inline-block", p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <QRCodeCanvas id="equipment-qr" value={url} size={220} level="M" includeMargin />
        </Box>
        <Typography variant="h6" sx={{ fontFamily: "monospace", fontWeight: 700, mt: 2 }}>{eq.code}</Typography>
        <Typography variant="body2">{eq.name}</Typography>
        {eq.location_name && (
          <Typography variant="caption" color="text.secondary">{eq.location_name}</Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Escanea para abrir la ficha del equipo
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: "space-between" }}>
        <Button startIcon={<Close />} onClick={onClose}>Cerrar</Button>
        <Button variant="contained" startIcon={<Print />} onClick={handlePrint}>Imprimir etiqueta</Button>
      </DialogActions>
    </Dialog>
  );
}
