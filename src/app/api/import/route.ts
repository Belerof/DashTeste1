import { route, HttpError } from "@/lib/guard";
import { audit, db, nextId, notify } from "@/lib/store";
import { importSales, importSellout, parseUpload } from "@/lib/tabular";

const MAX = 8 * 1024 * 1024;

export const GET = route("imports:view", async () => ({ history: db().imports.slice(0, 100) }));

export const POST = route("imports:import", async ({ user, scope, permissions }, req) => {
  const form = await req.formData();
  const kind = String(form.get("kind"));
  const dryRun = form.get("dryRun") === "true";
  const file = form.get("file");
  if (kind !== "sales" && kind !== "sellout") throw new HttpError(400, "kind must be sales or sellout");
  if (!permissions.includes(`${kind}:import`)) throw new HttpError(403, `Forbidden: missing permission ${kind}:import`);
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  if (file.size > MAX) throw new HttpError(413, "File too large (max 8 MB)");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new HttpError(400, "Only .csv, .xlsx or .xls files are accepted");
  let raw;
  try { raw = parseUpload(Buffer.from(await file.arrayBuffer()), file.name); } catch { throw new HttpError(400, "The file could not be read"); }
  if (!raw.length) throw new HttpError(400, "The file contains no data rows");
  if (raw.length > 50000) throw new HttpError(400, "Too many rows (max 50,000)");
  const result = kind === "sales" ? importSales(raw, scope, dryRun) : importSellout(raw, scope, dryRun);
  if (!dryRun) {
    const status = result.issues.length === 0 ? "completed" : result.imported > 0 ? "completed_with_errors" : "failed";
    db().imports.unshift({ id: nextId("imp"), at: new Date().toISOString(), userName: user.name, kind, fileName: file.name, rows: result.total, imported: result.imported, errors: result.issues.length, status });
    audit(user, "data.import", `${kind}:${file.name}`, `${result.imported}/${result.total} rows, ${result.issues.length} issues`);
    notify({ userId: user.id, type: "import", title: result.imported ? "Data import completed" : "Data import failed", body: `${file.name}: ${result.imported} of ${result.total} rows imported, ${result.issues.length} issues.`, severity: result.issues.length ? (result.imported ? "warning" : "error") : "success" });
  }
  return result;
});
