"use client";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Foliage, Logo } from "@/components/botanical";

interface Cfg { entra: boolean; demo: boolean; sessionOk: boolean; demoUsers: { email: string; name: string; roleId: string }[] }
const ERRORS: Record<string, string> = {
  not_configured: "Microsoft sign-in is not configured on this server yet.",
  signin_failed: "Microsoft sign-in did not complete. Please try again.",
  invalid_state: "The sign-in request expired or was tampered with. Please try again.",
  wrong_tenant: "This Microsoft account belongs to a different organisation.",
  no_email: "Your Microsoft account did not return an email address.",
  not_provisioned: "Your account has not been provisioned for this application. Ask an administrator to invite you.",
  deactivated: "Your account has been deactivated. Contact an administrator.",
};
const MS = (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden><rect width="10" height="10" fill="#f25022" /><rect x="11" width="10" height="10" fill="#7fba00" /><rect y="11" width="10" height="10" fill="#00a4ef" /><rect x="11" y="11" width="10" height="10" fill="#ffb900" /></svg>
);

export default function Login() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [next, setNext] = useState("/dashboard");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const e = p.get("error"); if (e) setError(ERRORS[e] ?? "Sign-in failed.");
    if (p.get("signedout")) setInfo("You have been signed out.");
    const n = p.get("next"); if (n?.startsWith("/") && !n.startsWith("//")) setNext(n);
    fetch("/api/auth/config").then((r) => r.json()).then((c: Cfg) => { setCfg(c); setPick(c.demoUsers[0]?.email ?? ""); }).catch(() => setError("Could not reach the server."));
  }, []);

  const demoLogin = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: pick }) });
    if (r.ok) window.location.href = next; else { setError((await r.json().catch(() => ({}))).error ?? "Sign-in failed"); setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <Foliage className="absolute inset-0 h-full w-full" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-paper">
          <Logo light />
          <div className="max-w-md">
            <p className="font-serif text-[44px] leading-[1.05]">Nature’s intelligence, applied to every decision.</p>
            <p className="mt-5 text-sm text-sage">Sales, sell-out and AI-assisted analysis for our international commercial teams.</p>
          </div>
          <p className="text-[11px] uppercase tracking-[.2em] text-sage/80">Botanical science · Premium haircare</p>
        </div>
      </div>
      <main className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <p className="label">Internal platform</p>
          <h1 className="h-serif mt-2 text-[40px] leading-tight">Welcome back</h1>
          <p className="mt-3 text-sm text-muted">Sign in with your corporate Microsoft 365 account. Access is limited to authorised colleagues.</p>

          {error && <div role="alert" className="mt-6 flex gap-2 rounded border border-bad/30 bg-bad/5 p-3 text-sm text-bad"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
          {info && <div role="status" className="mt-6 rounded border border-ok/30 bg-ok/5 p-3 text-sm text-ok">{info}</div>}

          <div className="mt-8">
            {cfg && cfg.entra ? (
              <a href={`/api/auth/login?next=${encodeURIComponent(next)}`} className="flex h-12 w-full items-center justify-center gap-3 rounded border border-forest bg-forest text-sm font-medium text-white transition-colors hover:bg-leaf">
                <span className="grid h-6 w-6 place-items-center rounded-sm bg-white">{MS}</span>Sign in with Microsoft
              </a>
            ) : (
              <>
                <button disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded border border-line bg-white text-sm font-medium text-muted opacity-70">{MS}Sign in with Microsoft</button>
                {cfg && <p className="mt-3 text-xs text-muted">Microsoft Entra ID is <b>not configured</b> on this server. Set <code>AZURE_AD_TENANT_ID</code>, <code>AZURE_AD_CLIENT_ID</code>, <code>AZURE_AD_CLIENT_SECRET</code> and <code>SESSION_SECRET</code> (see README). Sign-in is unavailable until then.</p>}
              </>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-leaf" />Authentication is handled by Microsoft Entra ID (OpenID Connect). Your password is never seen or stored by this application.</p>
          </div>

          {cfg?.demo && (
            <div className="mt-10 rounded border border-dashed border-gold/60 bg-gold/5 p-4">
              <div className="flex items-center justify-between"><span className="label text-[#8a7747]">Local development only</span><span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] text-[#8a7747]">NOT Microsoft sign-in</span></div>
              <p className="mt-2 text-xs text-muted">Preview the app as a seeded demonstration user. This bypass is disabled in production and whenever <code>DEMO_AUTH</code> is not <code>true</code>.</p>
              <label className="mt-3 block"><span className="sr-only">Demo user</span>
                <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>{cfg.demoUsers.map((u) => <option key={u.email} value={u.email}>{u.name} — {u.roleId.replace(/_/g, " ")}</option>)}</select>
              </label>
              <button className="btn-ghost mt-3 w-full" onClick={demoLogin} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}Continue as demo user</button>
            </div>
          )}
          {cfg && !cfg.sessionOk && <p className="mt-6 text-xs text-bad">SESSION_SECRET is missing or shorter than 32 characters: no session can be created.</p>}
        </div>
      </main>
    </div>
  );
}
