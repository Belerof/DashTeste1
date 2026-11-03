"use client";
import clsx from "clsx";
import { Bell, ChevronLeft, ChevronRight, LayoutDashboard, LineChart, LogOut, Menu, Package, Search, Settings, ShieldCheck, Sparkles, UserCircle2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, fmtDateTime, useApi } from "@/lib/client";
import { useApp } from "./app-context";
import { Logo } from "./botanical";
import { Badge, Confirm, DemoBadge, useToast } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard:view" },
  { href: "/sales", label: "Sales", icon: LineChart, perm: "sales:view" },
  { href: "/sell-out", label: "Sell-Out", icon: Package, perm: "sellout:view" },
  { href: "/ai", label: "AI Intelligence", icon: Sparkles, perm: "ai:view" },
  { href: "/permissions", label: "Permissions", icon: ShieldCheck, perm: "users:view" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings:view" },
  { href: "/profile", label: "Profile", icon: UserCircle2, perm: "" },
];
const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.href, n.label]));

export function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return src ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-sage/40 font-medium text-forest" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials}</span>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useApp();
  const path = usePathname(); const router = useRouter(); const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("phyto.sidebar") === "1"); } catch { /* ignore */ } }, []);
  useEffect(() => setMobile(false), [path]);
  const toggle = () => { setCollapsed(!collapsed); try { localStorage.setItem("phyto.sidebar", collapsed ? "0" : "1"); } catch { /* ignore */ } };
  const logout = async () => {
    try { const r = await api<{ redirect: string }>("/api/auth/logout", { method: "POST", body: {} }); sessionStorage.clear(); window.location.href = r.redirect; }
    catch { toast("error", "Sign-out failed"); }
  };
  const nav = NAV.filter((n) => !n.perm || can(n.perm));
  const base = "/" + (path.split("/")[1] ?? "");
  const allowedHere = !TITLES[base] || !NAV.find((n) => n.href === base)?.perm || can(NAV.find((n) => n.href === base)!.perm);

  const sidebar = (compact: boolean) => (
    <div className="flex h-full flex-col bg-white">
      <div className={clsx("flex h-16 items-center border-b border-line", compact ? "justify-center" : "px-5")}><Link href="/dashboard" aria-label="PHYTO home"><Logo collapsed={compact} /></Link></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
        {nav.map((n) => {
          const on = base === n.href;
          return (
            <Link key={n.href} href={n.href} title={compact ? n.label : undefined} aria-current={on ? "page" : undefined}
              className={clsx("group relative flex items-center gap-3 rounded px-3 py-2.5 text-sm transition-colors", on ? "bg-cream font-medium text-forest" : "text-muted hover:bg-cream/60 hover:text-ink", compact && "justify-center px-0")}>
              {on && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r bg-forest" />}
              <n.icon size={18} strokeWidth={1.6} />{!compact && n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <Link href="/profile" className={clsx("flex items-center gap-3 rounded p-2 hover:bg-cream/60", compact && "justify-center")}>
          <Avatar name={me.user.name} src={me.user.avatar} />
          {!compact && <div className="min-w-0"><div className="truncate text-sm font-medium">{me.user.name}</div><div className="truncate text-xs text-muted">{me.user.role}</div></div>}
        </Link>
        <button onClick={() => setConfirmOut(true)} title="Logout" className={clsx("mt-1 flex w-full items-center gap-3 rounded px-3 py-2 text-sm text-muted hover:bg-cream/60 hover:text-bad", compact && "justify-center px-0")}><LogOut size={17} strokeWidth={1.6} />{!compact && "Logout"}</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className={clsx("fixed inset-y-0 left-0 z-30 hidden border-r border-line transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>
        {sidebar(collapsed)}
        <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="absolute -right-3 top-[52px] grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-muted shadow-soft hover:text-forest">{collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}</button>
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-ink/40" onClick={() => setMobile(false)} /><div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{sidebar(false)}</div></div>
      )}
      <div className={clsx("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <Topbar onMenu={() => setMobile(true)} />
        <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          {allowedHere ? children : <div className="card p-10 text-center"><h1 className="h-serif text-2xl">Access restricted</h1><p className="mt-2 text-sm text-muted">Your role does not include access to this section.</p><button className="btn-primary mt-4" onClick={() => router.push("/profile")}>Go to profile</button></div>}
        </main>
      </div>
      <Confirm open={confirmOut} title="Sign out" body="You will be signed out of this application and your Microsoft session where applicable." confirmLabel="Sign out" onConfirm={logout} onClose={() => setConfirmOut(false)} />
    </div>
  );
}

interface Notif { id: string; at: string; title: string; body: string; read: boolean; severity: "info" | "success" | "warning" | "error" }

function Topbar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname(); const { me, meta, refreshMe, patchFilters } = useApp(); const router = useRouter();
  const base = "/" + (path.split("/")[1] ?? "");
  const title = TITLES[base] ?? "Dashboard";
  const crumbs = [{ label: String(me.settings.company ?? "Company") }, { label: title }];
  const [bell, setBell] = useState(false); const [q, setQ] = useState(""); const [sOpen, setSOpen] = useState(false);
  const notif = useApi<{ items: Notif[]; unread: number }>(bell ? "/api/notifications" : null);
  const ref = useRef<HTMLDivElement>(null); const sref = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setBell(false); if (!sref.current?.contains(e.target as Node)) setSOpen(false); };
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    return [
      ...NAV.filter((n) => n.label.toLowerCase().includes(s)).map((n) => ({ kind: "Page", label: n.label, go: () => router.push(n.href) })),
      ...meta.customers.filter((c) => c.label.toLowerCase().includes(s)).slice(0, 5).map((c) => ({ kind: "Customer", label: c.label, go: () => { patchFilters({ customers: [c.value] }); router.push("/sales"); } })),
      ...meta.products.filter((p) => p.label.toLowerCase().includes(s)).slice(0, 5).map((p) => ({ kind: "Product", label: p.label, go: () => { patchFilters({ products: [p.value] }); router.push("/sales"); } })),
    ];
  }, [q, meta, router, patchFilters]);
  const markAll = async () => { await api("/api/notifications", { body: { all: true } }); notif.reload(); refreshMe(); };
  const unread = bell && notif.data ? notif.data.unread : me.unread;
  const tone = { info: "info", success: "ok", warning: "warn", error: "bad" } as const;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="rounded p-2 text-muted hover:bg-cream lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="hidden whitespace-nowrap text-[11px] uppercase tracking-[.14em] text-muted sm:block">{crumbs.map((c, i) => <span key={i}>{i > 0 && <span className="mx-1.5">/</span>}{c.label}</span>)}</nav>
          <h1 className="truncate font-serif text-2xl leading-tight text-forest sm:text-[28px]">{title}</h1>
        </div>
        <div ref={sref} className="relative hidden lg:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSOpen(true); }} onFocus={() => setSOpen(true)} className="input w-48 pl-9 xl:w-80" placeholder="Search pages, customers, products (Ctrl+K)" aria-label="Global search" />
          {sOpen && q.trim().length >= 2 && (
            <div className="card absolute left-0 top-10 z-30 w-full min-w-[20rem] p-1">
              {results.length === 0 && <div className="px-3 py-3 text-sm text-muted">No results</div>}
              {results.map((r, i) => <button key={i} className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-cream" onClick={() => { r.go(); setSOpen(false); setQ(""); }}><span className="truncate">{r.label}</span><Badge>{r.kind}</Badge></button>)}
            </div>
          )}
        </div>
        <span className="hidden xl:block"><DemoBadge /></span>
        <div ref={ref} className="relative">
          <button onClick={() => setBell(!bell)} className="relative rounded p-2 text-muted hover:bg-cream hover:text-forest" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={bell}>
            <Bell size={19} strokeWidth={1.6} />{unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-medium text-white">{unread}</span>}
          </button>
          {bell && (
            <div className="card absolute right-0 top-11 z-30 w-[24rem] max-w-[92vw]">
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="font-serif text-lg text-forest">Notifications</span><button className="text-xs text-leaf hover:underline" onClick={markAll}>Mark all read</button></div>
              <ul className="max-h-96 divide-y divide-line/70 overflow-y-auto">
                {notif.loading && <li className="px-4 py-6 text-sm text-muted">Loading...</li>}
                {notif.data?.items.map((n) => (
                  <li key={n.id} className={clsx("px-4 py-3", !n.read && "bg-cream/60")}>
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{n.title}</span><Badge tone={tone[n.severity]}>{n.severity}</Badge></div>
                    <p className="mt-0.5 text-xs text-muted">{n.body}</p><p className="mt-1 text-[10px] text-muted/80">{fmtDateTime(n.at)}</p>
                  </li>
                ))}
                {notif.data && notif.data.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</li>}
              </ul>
            </div>
          )}
        </div>
        <Link href="/profile" className="flex items-center gap-2.5 rounded p-1 hover:bg-cream"><Avatar name={me.user.name} src={me.user.avatar} size={34} /><span className="hidden text-left leading-tight sm:block"><span className="block text-sm font-medium">{me.user.name}</span><span className="block text-[11px] text-muted">{me.user.role}</span></span></Link>
      </div>
    </header>
  );
}
