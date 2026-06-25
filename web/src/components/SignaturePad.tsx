import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Box, Button } from "@mui/material";
import { Clear } from "@mui/icons-material";

export interface SignaturePadHandle {
  toBlob: () => Promise<Blob | null>;
  isEmpty: () => boolean;
  clear: () => void;
}

/** Lienzo de firma con eventos de puntero (sin dependencias externas). */
const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  ({ height = 200 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [dirty, setDirty] = useState(false);

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      const c = canvasRef.current!;
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      drawing.current = true;
      const ctx = canvasRef.current!.getContext("2d")!;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvasRef.current!.setPointerCapture(e.pointerId);
    }
    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      const ctx = canvasRef.current!.getContext("2d")!;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#1a1a2e";
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!dirty) setDirty(true);
    }
    function end() { drawing.current = false; }

    function clear() {
      const c = canvasRef.current!;
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      setDirty(false);
    }

    useImperativeHandle(ref, () => ({
      toBlob: () => new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b), "image/png")),
      isEmpty: () => !dirty,
      clear,
    }));

    return (
      <Box>
        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1.5, bgcolor: "#fafafa", touchAction: "none" }}>
          <canvas
            ref={canvasRef}
            width={500}
            height={height}
            style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
          <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>Firme dentro del recuadro</Box>
          <Button size="small" startIcon={<Clear />} onClick={clear}>Limpiar</Button>
        </Box>
      </Box>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
export default SignaturePad;
