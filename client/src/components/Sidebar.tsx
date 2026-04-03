import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { App } from "@/types/schema";

interface SidebarProps {
  apps: App[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNewApp: () => void;
}

const statusColors: Record<string, string> = {
  draft: "secondary",
  deploying: "default",
  deployed: "default",
  failed: "destructive",
} as const;

export function Sidebar({
  apps,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewApp,
}: SidebarProps) {
  const filtered = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-card/50">
      <div className="p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={onNewApp} className="w-full" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New App
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {apps.length === 0 ? "No apps yet" : "No matches"}
            </p>
          )}
          {filtered.map((app) => (
            <button
              key={app.id}
              onClick={() => onSelect(app.id)}
              className={cn(
                "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                selectedId === app.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">
                  {app.name}
                </span>
                <Badge
                  variant={statusColors[app.status] as "default" | "secondary" | "destructive"}
                  className="text-[10px] px-1.5 py-0 shrink-0"
                >
                  {app.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {app.description}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
