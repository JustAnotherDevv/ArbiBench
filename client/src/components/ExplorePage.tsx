import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, RefreshCw, ArrowUpRight, Copy, ExternalLink, Eye, PenLine, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { App } from "@/types/schema";

// ── Color system ──────────────────────────────────────────────────────────────
// Each has a hex (for inline glow/tint) and Tailwind gradient classes for icons

const COLORS = [
  { hex: "#8b5cf6", from: "from-violet-500",  to: "to-purple-600"  },
  { hex: "#3b82f6", from: "from-blue-500",    to: "to-cyan-500"    },
  { hex: "#10b981", from: "from-emerald-500", to: "to-green-600"   },
  { hex: "#f59e0b", from: "from-amber-500",   to: "to-orange-500"  },
  { hex: "#f43f5e", from: "from-rose-500",    to: "to-pink-600"    },
  { hex: "#6366f1", from: "from-indigo-500",  to: "to-blue-600"    },
  { hex: "#14b8a6", from: "from-teal-500",    to: "to-cyan-600"    },
  { hex: "#d946ef", from: "from-fuchsia-500", to: "to-violet-600"  },
] as const;

function colorOf(id: string) {
  return COLORS[id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function ago(d: string) {
  const s = (Date.now() - +new Date(d)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${~~(s / 60)}m`;
  if (s < 86400) return `${~~(s / 3600)}h`;
  if (s < 2592000) return `${~~(s / 86400)}d`;
  return `${~~(s / 2592000)}mo`;
}

function fresh(app: App) {
  return Date.now() - +new Date(app.publishedAt ?? app.createdAt) < 14 * 86400_000;
}

function readFns(app: App) {
  return app.abi.filter(i => i.type === "function" && (i.stateMutability === "view" || i.stateMutability === "pure")).length;
}

function writeFns(app: App) {
  return app.abi.filter(i => i.type === "function" && i.stateMutability !== "view" && i.stateMutability !== "pure").length;
}

function copyAddr(addr: string, e: React.MouseEvent) {
  e.stopPropagation();
  navigator.clipboard.writeText(addr).then(() => toast.success("Address copied"));
}

type Sort = "newest" | "oldest" | "name_asc" | "name_desc";

export interface ExplorePageProps { onSelectApp: (app: App) => void; }

// ── Root ──────────────────────────────────────────────────────────────────────

export function ExplorePage({ onSelectApp }: ExplorePageProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [tag, setTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/apps?published=true");
      if (r.ok) setApps(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    apps.forEach(a => a.tags?.forEach(t => s.add(t)));
    return [...s].sort();
  }, [apps]);

  const sorted = useMemo(() => {
    const out = [...apps];
    if (sort === "oldest") return out.sort((a, b) => +new Date(a.publishedAt ?? a.updatedAt) - +new Date(b.publishedAt ?? b.updatedAt));
    if (sort === "name_asc") return out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "name_desc") return out.sort((a, b) => b.name.localeCompare(a.name));
    return out.sort((a, b) => +new Date(b.publishedAt ?? b.updatedAt) - +new Date(a.publishedAt ?? a.updatedAt));
  }, [apps, sort]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sorted.filter(a => {
      const ms = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q);
      return ms && (!tag || a.tags?.includes(tag));
    });
  }, [sorted, search, tag]);

  const isFiltering = !!(search || tag);
  const spotlight = !isFiltering && filtered.length > 0 ? filtered[0] : null;
  const newApps   = !isFiltering ? sorted.filter(fresh).slice(0, 10) : [];
  const gridApps  = isFiltering ? filtered : filtered.slice(spotlight ? 1 : 0);

  const liveCount = apps.filter(a => !!a.deployedAddress).length;
  const builders  = new Set(apps.map(a => a.owner)).size;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full overflow-hidden bg-background">

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <div className="dot-grid relative shrink-0 border-b border-white/[0.06] overflow-hidden">
          {/* Big ambient orbs */}
          <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-blue-500/12 blur-[100px]" />
          <div className="pointer-events-none absolute top-0 left-1/2 h-48 w-48 rounded-full bg-fuchsia-500/6 blur-[80px]" />

          {/* Decorative large watermark */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 sm:pr-8 overflow-hidden">
            <span className="font-black text-[100px] sm:text-[140px] leading-none text-white/[0.018] select-none tracking-tight">
              {apps.length > 0 ? apps.length.toString().padStart(2, "0") : "—"}
            </span>
          </div>

          <div className="relative px-6 sm:px-10 pt-8 sm:pt-10 pb-7 sm:pb-9">
            <p className="font-mono text-[9px] tracking-[0.28em] uppercase text-white/20 mb-5">
              Explore · Arbitrum Stylus
            </p>

            <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] font-thin tracking-[-0.03em] leading-[0.9] mb-5">
              Community
              <br />
              <span className="text-white/20">dApps</span>
            </h1>

            {/* Stats row */}
            {!loading && apps.length > 0 && (
              <div className="flex items-center gap-5 sm:gap-8">
                <HeroStat n={apps.length}  label="published" />
                <div className="h-8 w-px bg-white/[0.07]" />
                <HeroStat n={liveCount}    label="live" green />
                <div className="h-8 w-px bg-white/[0.07]" />
                <HeroStat n={builders}     label="builders" />
              </div>
            )}
          </div>
        </div>

        {/* ── Toolbar ────────────────────────────────────────────────────── */}
        <div className="shrink-0 sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white/[0.03] border-white/[0.07] placeholder:text-white/20 focus-visible:ring-1 focus-visible:ring-white/10"
              />
            </div>
            <Select value={sort} onValueChange={v => setSort(v as Sort)}>
              <SelectTrigger className="h-8 w-[110px] sm:w-[130px] text-xs border-white/[0.07] bg-white/[0.03] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="name_asc">A → Z</SelectItem>
                <SelectItem value="name_desc">Z → A</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-white/20 hover:text-white/60" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </Button>
          </div>

          {allTags.length > 0 && (
            <div className="flex gap-1.5 px-4 sm:px-6 pb-2.5 overflow-x-auto scrollbar-hide">
              <FilterChip active={!tag} onClick={() => setTag(null)}>All</FilterChip>
              {allTags.map(t => (
                <FilterChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</FilterChip>
              ))}
            </div>
          )}
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? <LoadSkeleton /> : filtered.length === 0 ? <Empty search={search} /> : (
            <div className="px-4 sm:px-6 lg:px-10 py-8 w-full space-y-10">

              {/* Spotlight */}
              {spotlight && (
                <section>
                  <RowLabel>Featured</RowLabel>
                  <SpotlightCard app={spotlight} onOpen={onSelectApp} />
                </section>
              )}

              {/* New arrivals */}
              {newApps.length > 1 && (
                <section>
                  <RowLabel>New arrivals</RowLabel>
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                    {newApps.map(a => <MiniCard key={a.id} app={a} onOpen={onSelectApp} />)}
                  </div>
                </section>
              )}

              {/* Grid */}
              {gridApps.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <RowLabel>
                      {isFiltering ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : "All apps"}
                    </RowLabel>
                    {!isFiltering && (
                      <span className="font-mono text-[10px] text-white/15 tabular-nums">
                        {apps.length.toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {gridApps.map(a => <AppCard key={a.id} app={a} onOpen={onSelectApp} />)}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────

function HeroStat({ n, label, green }: { n: number; label: string; green?: boolean }) {
  return (
    <div>
      <div className={cn("font-mono text-2xl font-light tabular-nums", green ? "text-emerald-400" : "text-white/80")}>
        {n}
      </div>
      <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/20 mt-0.5">{label}</div>
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-white/20">{children}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase px-3 py-1 rounded-full border transition-all",
        active
          ? "border-white/25 bg-white/[0.1] text-white/90"
          : "border-white/[0.06] text-white/25 hover:border-white/15 hover:text-white/50",
      )}
    >
      {children}
    </button>
  );
}

// ── AppIcon ───────────────────────────────────────────────────────────────────

function AppIcon({
  app, size = "md",
}: {
  app: App;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const c = colorOf(app.id);
  const sizes = {
    xs: { box: "h-7 w-7 rounded-lg text-[10px]",  shadow: 12 },
    sm: { box: "h-9 w-9 rounded-xl text-[11px]",  shadow: 14 },
    md: { box: "h-11 w-11 rounded-xl text-sm",     shadow: 18 },
    lg: { box: "h-16 w-16 rounded-2xl text-xl",    shadow: 28 },
    xl: { box: "h-20 w-20 rounded-3xl text-2xl",   shadow: 40 },
  }[size];
  return (
    <div
      className={cn(`bg-gradient-to-br ${c.from} ${c.to} shrink-0 flex items-center justify-center font-bold text-white select-none`, sizes.box)}
      style={{ boxShadow: `0 ${sizes.shadow / 2}px ${sizes.shadow}px ${c.hex}55` }}
    >
      {initials(app.name)}
    </div>
  );
}

// ── Spotlight ─────────────────────────────────────────────────────────────────

function SpotlightCard({ app, onOpen }: { app: App; onOpen: (a: App) => void }) {
  const c = colorOf(app.id);
  const r = readFns(app);
  const w = writeFns(app);

  return (
    <div
      onClick={() => onOpen(app)}
      className="group relative rounded-3xl cursor-pointer overflow-hidden transition-all"
      style={{ background: `linear-gradient(135deg, ${c.hex}18 0%, ${c.hex}06 50%, transparent 100%)` }}
    >
      {/* Border overlay */}
      <div
        className="absolute inset-0 rounded-3xl transition-all group-hover:opacity-150"
        style={{ boxShadow: `inset 0 0 0 1px ${c.hex}25, 0 0 0 0 ${c.hex}00` }}
      />
      {/* Subtle corner glow on hover */}
      <div
        className="absolute -top-12 -left-12 h-40 w-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none"
        style={{ background: c.hex + "20" }}
      />

      <div className="relative flex flex-col sm:flex-row items-start gap-6 p-6 sm:p-8">
        {/* Large icon */}
        <div className="shrink-0">
          <AppIcon app={app} size="xl" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <span className="font-mono text-[9px] tracking-[0.25em] uppercase" style={{ color: c.hex + "aa" }}>
              Featured
            </span>
            {fresh(app) && (
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-emerald-400/70 border border-emerald-400/20 bg-emerald-400/8 px-1.5 py-px rounded-full">
                new
              </span>
            )}
            <span className="font-mono text-[9px] text-white/20 ml-auto">{ago(app.publishedAt ?? app.updatedAt)}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-light tracking-tight leading-tight mb-2">
            {app.name}
          </h2>

          {app.description && (
            <p className="text-sm font-light text-white/45 leading-relaxed line-clamp-2 max-w-xl mb-4">
              {app.description}
            </p>
          )}

          {/* ABI counts */}
          {(r > 0 || w > 0) && (
            <div className="flex gap-4 mb-4">
              {r > 0 && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                  <Eye className="h-3 w-3" />{r} read
                </span>
              )}
              {w > 0 && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                  <PenLine className="h-3 w-3" />{w} write
                </span>
              )}
            </div>
          )}

          {/* Tags */}
          {app.tags && app.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {app.tags.slice(0, 6).map(t => (
                <span
                  key={t}
                  className="font-mono text-[9px] tracking-wide uppercase px-2 py-0.5 rounded border text-white/30"
                  style={{ borderColor: c.hex + "30", background: c.hex + "0a" }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Address row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[10px] text-white/20">{shortAddr(app.owner)}</span>
            {app.deployedAddress && (
              <>
                <div className="h-3 w-px bg-white/[0.08]" />
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.hex }} />
                <span className="font-mono text-[10px] text-white/35">{shortAddr(app.deployedAddress)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={e => copyAddr(app.deployedAddress!, e)} className="text-white/20 hover:text-white/60 transition-colors">
                      <Copy className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy address</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={`https://sepolia.arbiscan.io/address/${app.deployedAddress}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/20 hover:text-white/60 transition-colors">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Arbiscan</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="sm:self-center shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onOpen(app); }}
            className="flex items-center gap-1.5 font-mono text-[11px] transition-colors"
            style={{ color: c.hex + "90" }}
            onMouseEnter={e => (e.currentTarget.style.color = c.hex)}
            onMouseLeave={e => (e.currentTarget.style.color = c.hex + "90")}
          >
            Open
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MiniCard ──────────────────────────────────────────────────────────────────

function MiniCard({ app, onOpen }: { app: App; onOpen: (a: App) => void }) {
  const c = colorOf(app.id);
  return (
    <button
      onClick={() => onOpen(app)}
      className="group shrink-0 w-[148px] sm:w-[160px] rounded-2xl overflow-hidden text-left transition-all hover:-translate-y-0.5"
    >
      {/* Gradient header zone */}
      <div
        className="relative h-14 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${c.hex}22, ${c.hex}0a)` }}
      >
        <AppIcon app={app} size="sm" />
        {fresh(app) && (
          <span className="absolute top-2 right-2 font-mono text-[7px] tracking-widest uppercase text-emerald-400/80">new</span>
        )}
      </div>

      {/* Content */}
      <div
        className="px-3 py-2.5 border border-t-0"
        style={{ borderColor: c.hex + "18" }}
      >
        <p className="text-[11px] font-medium truncate leading-tight mb-0.5">{app.name}</p>
        {app.description && (
          <p className="font-mono text-[9px] text-white/25 line-clamp-2 leading-relaxed">{app.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          {app.deployedAddress
            ? <><span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.hex + "cc" }} /><span className="font-mono text-[8px]" style={{ color: c.hex + "80" }}>live</span></>
            : <span className="font-mono text-[8px] text-white/15">draft</span>
          }
        </div>
      </div>
    </button>
  );
}

// ── AppCard ───────────────────────────────────────────────────────────────────

function AppCard({ app, onOpen }: { app: App; onOpen: (a: App) => void }) {
  const c = colorOf(app.id);
  const r = readFns(app);
  const w = writeFns(app);

  return (
    <div
      onClick={() => onOpen(app)}
      className="group rounded-2xl overflow-hidden cursor-pointer flex flex-col transition-all hover:-translate-y-0.5"
    >
      {/* Colored header zone — the main visual differentiator */}
      <div
        className="relative flex items-end justify-between px-4 pt-4 pb-3 shrink-0"
        style={{ background: `linear-gradient(135deg, ${c.hex}22 0%, ${c.hex}0c 100%)` }}
      >
        <AppIcon app={app} size="md" />
        <div className="flex items-center gap-2">
          {fresh(app) && (
            <span className="font-mono text-[8px] tracking-widest uppercase text-emerald-400/70">new</span>
          )}
          {app.deployedAddress
            ? <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.hex + "cc" }} />
            : <span className="h-1.5 w-1.5 rounded-full bg-white/15 shrink-0" />
          }
        </div>
      </div>

      {/* Content + footer */}
      <div
        className="flex-1 flex flex-col border border-t-0 rounded-b-2xl"
        style={{ borderColor: c.hex + "18" }}
      >
        <div className="px-4 pt-3 pb-3 flex-1 flex flex-col gap-2">
          {/* Name + owner */}
          <div>
            <h4 className="text-sm font-medium leading-tight">{app.name}</h4>
            <span className="font-mono text-[9px] text-white/20">{shortAddr(app.owner)}</span>
          </div>

          {/* Description */}
          {app.description && (
            <p className="text-[11px] font-light text-white/40 line-clamp-2 leading-relaxed flex-1">
              {app.description}
            </p>
          )}

          {/* ABI chips */}
          {(r > 0 || w > 0) && (
            <div className="flex gap-3">
              {r > 0 && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-white/25">
                  <Eye className="h-2.5 w-2.5" />{r}
                </span>
              )}
              {w > 0 && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-white/25">
                  <PenLine className="h-2.5 w-2.5" />{w}
                </span>
              )}
            </div>
          )}

          {/* Tags */}
          {app.tags && app.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {app.tags.slice(0, 3).map(t => (
                <span
                  key={t}
                  className="font-mono text-[8px] tracking-wide uppercase px-1.5 py-0.5 rounded"
                  style={{ background: c.hex + "12", color: c.hex + "80", border: `1px solid ${c.hex}25` }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2.5 flex items-center justify-between border-t"
          style={{ borderColor: c.hex + "12" }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {app.deployedAddress
              ? <span className="font-mono text-[9px] text-white/25 truncate">{shortAddr(app.deployedAddress)}</span>
              : <span className="font-mono text-[9px] text-white/15">not deployed</span>
            }
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="font-mono text-[9px] text-white/15 group-hover:hidden">{ago(app.publishedAt ?? app.updatedAt)}</span>
            <div className="hidden group-hover:flex items-center gap-0.5">
              {app.deployedAddress && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={e => copyAddr(app.deployedAddress!, e)} className="p-1 text-white/20 hover:text-white/60 transition-colors">
                        <Copy className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy address</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a href={`https://sepolia.arbiscan.io/address/${app.deployedAddress}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1 text-white/20 hover:text-white/60 transition-colors">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>Arbiscan</TooltipContent>
                  </Tooltip>
                </>
              )}
              <ArrowUpRight className="h-3 w-3 text-white/20 ml-0.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-10 py-8 max-w-5xl mx-auto w-full space-y-10">
      {/* Spotlight */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="h-2 w-16 bg-white/[0.04]" />
          <Skeleton className="flex-1 h-px bg-white/[0.03]" />
        </div>
        <div className="rounded-3xl p-8 border border-white/[0.06] flex gap-6">
          <Skeleton className="h-20 w-20 rounded-3xl shrink-0 bg-white/[0.05]" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-2 w-20 bg-white/[0.04]" />
            <Skeleton className="h-8 w-52 bg-white/[0.05]" />
            <Skeleton className="h-3 w-full max-w-md bg-white/[0.03]" />
            <Skeleton className="h-3 w-2/3 max-w-xs bg-white/[0.03]" />
          </div>
        </div>
      </div>
      {/* Grid */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="h-2 w-14 bg-white/[0.04]" />
          <Skeleton className="flex-1 h-px bg-white/[0.03]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden">
              <Skeleton className="h-[72px] w-full rounded-none bg-white/[0.04]" />
              <div className="p-4 space-y-3 border border-t-0 border-white/[0.05] rounded-b-2xl">
                <Skeleton className="h-4 w-28 bg-white/[0.04]" />
                <Skeleton className="h-3 w-full bg-white/[0.03]" />
                <Skeleton className="h-3 w-4/5 bg-white/[0.03]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Empty ─────────────────────────────────────────────────────────────────────

function Empty({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-5 text-center px-6">
      <div className="h-16 w-16 rounded-2xl border border-white/[0.06] flex items-center justify-center bg-white/[0.02]">
        <Zap className="h-7 w-7 text-white/15" />
      </div>
      <div className="space-y-2">
        <p className="text-base font-light text-white/60">
          {search ? "No results" : "Nothing published yet"}
        </p>
        <p className="font-mono text-[10px] tracking-wide text-white/20 max-w-xs leading-relaxed">
          {search ? `No apps match "${search}"` : "Build something and be the first to publish"}
        </p>
      </div>
    </div>
  );
}
