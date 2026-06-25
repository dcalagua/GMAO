export function exportCsv(filename: string, rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(",")
  ).join("\r\n");
  // BOM para compatibilidad con Excel en español
  const blob = new Blob(["﻿" + header + "\r\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
