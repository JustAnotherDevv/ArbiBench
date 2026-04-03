import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Boxes, Hammer, Compass, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { App } from "@/types/schema";

interface SidebarProps {
  activeMode: "build" | "explore";
  onModeChange: (mode: "build" | "explore") => void;
  apps: App[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string | null) => void;
  onNewApp: () => void;
  onDelete?: (id: string) => void;
}

const statusDot: Record<string, string> = {
  draft:     "bg-zinc-500",
  building:  "bg-blue-400 animate-pulse",
  deploying: "bg-amber-400 animate-pulse",
  deployed:  "bg-green-400",
  failed:    "bg-red-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Sidebar({
  activeMode,
  onModeChange,
  apps,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewApp,
  onDelete,
}: SidebarProps) {
  const filtered = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="hidden md:flex h-full w-[220px] flex-col border-r border-white/[0.06] bg-background">
      {/* Mode switcher */}
      <div className="flex border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => onModeChange("build")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            activeMode === "build"
              ? "text-foreground border-b-2 border-primary bg-transparent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Hammer className="h-3.5 w-3.5" />
          Build
        </button>
        <button
          onClick={() => onModeChange("explore")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            activeMode === "explore"
              ? "text-foreground border-b-2 border-primary bg-transparent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Compass className="h-3.5 w-3.5" />
          Explore
        </button>
      </div>

      {/* Build content — only visible in build mode */}
      {activeMode === "build" && (
        <>
          <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search apps…"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button onClick={onNewApp} className="w-full h-8 text-xs gap-1.5" size="sm">
              <Plus className="h-3.5 w-3.5" />
              New App
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-0.5">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Boxes className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {apps.length === 0
                      ? "No apps yet.\nCreate your first dApp."
                      : "No matches"}
                  </p>
                </div>
              )}
              {filtered.map((app) => {
                const isSelected = selectedId === app.id;
                return (
                  <div key={app.id} className="group relative">
                    <button
                      onClick={() => onSelect(app.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-1.5 transition-colors relative pr-8",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/40 text-foreground",
                      )}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-primary" />
                      )}
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            statusDot[app.status] ?? "bg-zinc-500",
                          )}
                        />
                        <span className="font-medium text-[13px] truncate flex-1">
                          {app.name}
                        </span>
                        {app.published && (
                          <span className="shrink-0 text-[9px] font-semibold text-emerald-400 uppercase tracking-wide">
                            live
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 pl-3.5">
                        <p className="text-[11px] text-muted-foreground truncate">
                          {app.status === "deployed" && app.deployedAddress
                            ? shortenAddr(app.deployedAddress)
                            : app.description || app.status}
                        </p>
                        <p className="text-[10px] text-muted-foreground/40 shrink-0 ml-1">
                          {timeAgo(app.updatedAt)}
                        </p>
                      </div>
                    </button>
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(app.id);
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        title="Delete app"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Explore mode: sidebar shows nothing (content is in ExplorePage) */}
      {activeMode === "explore" && (
        <div className="flex-1 flex items-start justify-center pt-10 px-4">
          <p className="text-[11px] text-muted-foreground/40 text-center leading-relaxed">
            Browse published apps →
          </p>
        </div>
      )}
    </div>
  );
}
