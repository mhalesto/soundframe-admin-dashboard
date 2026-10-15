// CSV export. Exports contain only fields the dashboard already shows to an admin; auth tokens never appear.
import { toast } from "./ui.js";

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : String(value);
  // Neutralise spreadsheet formula injection from user-controlled strings.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCSV(filename, header, rows) {
  if (!rows.length) {
    toast("Nothing to export with the current filters.", "warn");
    return;
  }
  const content = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"} to ${filename}.`, "ok");
}
