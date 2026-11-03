import { route, HttpError } from "@/lib/guard";
import { audit, db } from "@/lib/store";
import { z } from "zod";

const has = (k: string) => !!process.env[k];

export const GET = route("settings:view", async ({ permissions }) => ({
  settings: db().settings,
  canEdit: permissions.includes("settings:edit"),
  canConfigure: permissions.includes("settings:configure_settings"),
  fx: db().fx,
  // Secrets are never returned or editable here: only whether the backend has them.
  integrations: {
    entra: { configured: has("AZURE_AD_TENANT_ID") && has("AZURE_AD_CLIENT_ID") && has("AZURE_AD_CLIENT_SECRET"), tenantId: process.env.AZURE_AD_TENANT_ID ? `${process.env.AZURE_AD_TENANT_ID.slice(0, 8)}...` : null, redirectUri: `${process.env.APP_URL || "http://localhost:3000"}/api/auth/callback` },
    microsoft365: { configured: has("AZURE_AD_CLIENT_ID") },
    powerbi: { configured: has("POWERBI_CLIENT_ID") },
    ai: { configured: has("AI_API_KEY"), provider: process.env.AI_PROVIDER || "anthropic", model: process.env.AI_MODEL || "claude-sonnet-5-5" },
    database: { configured: has("DATABASE_URL"), adapterWired: true },
    externalApis: { configured: has("EXTERNAL_API_URL") },
    session: { configured: has("SESSION_SECRET") },
  },
}));

const put = z.record(z.string(), z.union([z.string().max(300000), z.number(), z.boolean()]));
const ALLOWED = new Set(["appName", "company", "language", "locale", "currency", "dateFormat", "timezone", "numberFormat", "refreshFrequency", "sessionTimeout", "validationMissing", "validationDuplicates", "validationSku", "validationPeriod", "aiProvider", "aiMaxRows", "dashboardDefaultRange", "emailDigest", "companyLogo"]);
const CONFIG_ONLY = new Set(["sessionTimeout", "aiProvider", "aiMaxRows", "refreshFrequency"]);

export const PUT = route("settings:edit", async ({ user, permissions }, req) => {
  const b = put.parse(await req.json());
  const changes: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (!ALLOWED.has(k)) throw new HttpError(400, `Unknown setting ${k}`);
    if (CONFIG_ONLY.has(k) && !permissions.includes("settings:configure_settings")) throw new HttpError(403, "Forbidden: missing permission settings:configure_settings");
    if (k === "companyLogo" && v !== "" && !(typeof v === "string" && v.length < 250000 && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v))) throw new HttpError(400, "Logo must be a PNG, JPEG, WebP or SVG image under 180 KB");
    if (typeof v === "string" && k !== "companyLogo" && v.length > 200) throw new HttpError(400, `${k} is too long`);
    if (k === "sessionTimeout" && (typeof v !== "number" || v < 5 || v > 720)) throw new HttpError(400, "Session timeout must be 5-720 minutes");
    if (db().settings[k] !== v) { changes.push(`${k}: ${db().settings[k]} -> ${v}`); db().settings[k] = v; }
  }
  if (changes.length) audit(user, "settings.update", "system_settings", changes.join("; "));
  return { ok: true, changed: changes.length };
});
