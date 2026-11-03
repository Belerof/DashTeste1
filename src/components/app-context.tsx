"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Filters, type Me, type Meta } from "@/lib/client";
import { Spinner } from "./ui";

interface Ctx {
  me: Me; meta: Meta; can: (p: string) => boolean;
  filters: Filters; setFilters: (f: Filters) => void; patchFilters: (f: Partial<Filters>) => void; resetFilters: () => void;
  compare: "prev" | "yoy"; setCompare: (c: "prev" | "yoy") => void; refreshMe: () => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error("AppProvider missing"); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFiltersState] = useState<Filters>({});
  const [compare, setCompare] = useState<"prev" | "yoy">("yoy");
  const [err, setErr] = useState<string | null>(null);

  const refreshMe = useCallback(() => { api<Me>("/api/me").then(setMe).catch(() => {}); }, []);
  useEffect(() => {
    Promise.all([api<Me>("/api/me"), api<Meta>("/api/meta")]).then(([m, mt]) => {
      setMe(m); setMeta(mt);
      let saved: Filters | null = null;
      try { saved = JSON.parse(sessionStorage.getItem("phyto.filters") ?? "null"); } catch { /* ignore */ }
      setFiltersState(saved ?? { ...mt.defaultRange });
    }).catch((e) => setErr(e.message));
  }, []);
  const setFilters = useCallback((f: Filters) => { setFiltersState(f); try { sessionStorage.setItem("phyto.filters", JSON.stringify(f)); } catch { /* ignore */ } }, []);
  const patchFilters = useCallback((p: Partial<Filters>) => setFilters({ ...filters, ...p }), [filters, setFilters]);
  const resetFilters = useCallback(() => { if (meta) setFilters({ ...meta.defaultRange }); }, [meta, setFilters]);
  const value = useMemo(() => (me && meta ? { me, meta, can: (p: string) => me.permissions.includes(p), filters, setFilters, patchFilters, resetFilters, compare, setCompare, refreshMe } : null), [me, meta, filters, setFilters, patchFilters, resetFilters, compare, refreshMe]);

  if (err) return <div className="p-10 text-center text-sm text-bad">Could not load the application: {err}</div>;
  if (!value) return <div className="grid min-h-screen place-items-center"><Spinner label="Loading your workspace" /></div>;
  return <C.Provider value={value}>{children}</C.Provider>;
}
