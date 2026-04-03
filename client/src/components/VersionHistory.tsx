import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw, ExternalLink, Tag, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { App, Version } from "@/types/schema";
import { toast } from "sonner";

interface VersionHistoryProps {
  app: App;
  isOwner: boolean;
  walletAddress: string | null;
  onRestored: () => void; // callback to refresh app after restore
}

export function VersionHistory({ app, isOwner, walletAddress, onRestored }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${app.id}/versions`, {
        headers: walletAddress ? { "x-wallet-address": walletAddress } : {},
      });
      if (res.ok) setVersions(await res.json() as Version[]);
    } finally {
      setLoading(false);
    }
  }, [app.id, walletAddress]);

  useEffect(() => { void fetchVersions(); }, [fetchVersions]);

  const handleRestore = async (version: Version) => {
    if (!isOwner) return;
    setRestoring(version.id);
    try {
      const res = await fetch(`/api/apps/${app.id}/versions/${version.id}/restore`, {
        method: "POST",
        headers: { "x-wallet-address": walletAddress ?? "" },
      });
      if (!res.ok) throw new Error("Restore failed");
      toast.success("Version restored — code updated");
      onRestored();
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoring(null);
    }
  };

  const saveLabel = async (version: Version) => {
    try {
      await fetch(`/api/apps/${app.id}/versions/${version.id}/label`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress ?? "",
        },
        body: JSON.stringify({ label: labelInput }),
      });
      setVersions((vs) =>
        vs.map((v) => v.id === version.id ? { ...v, label: labelInput } : v)
      );
    } finally {
      setEditingLabel(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading versions...
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground gap-2">
        <p className="text-sm">No versions yet</p>
        <p className="text-xs opacity-60">Versions are saved automatically after each successful build.</p>
      </div>
    );
  }

  // The latest version (index 0) is always the "current" one
  const currentContractCode = app.contractCode.trim();

  return (
    <div className="space-y-2">
      {versions.map((version, i) => {
        const isLatest = i === 0;
        const isLive = !!version.deployedAddress;
        const isCurrent = version.contractCode.trim() === currentContractCode;
        const isExpanded = expanded === version.id;

        return (
          <div
            key={version.id}
            className={cn(
              "rounded-lg border transition-colors",
              isLive ? "border-green-500/30 bg-green-500/5" : "border-border/50 bg-card/30",
            )}
          >
            {/* Header row */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpanded(isExpanded ? null : version.id)}
            >
              <ChevronRight
                className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", isExpanded && "rotate-90")}
              />

              {/* Label / timestamp */}
              <div className="flex-1 min-w-0">
                {editingLabel === version.id ? (
                  <Input
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveLabel(version);
                      if (e.key === "Escape") setEditingLabel(null);
                    }}
                    onBlur={() => void saveLabel(version)}
                    autoFocus
                    className="h-6 text-xs py-0 px-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">
                      {version.label || `v${versions.length - i}`}
                    </span>
                    {isOwner && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLabelInput(version.label ?? "");
                          setEditingLabel(version.id);
                        }}
                        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        title="Rename"
                      >
                        <Tag className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {isLatest && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">latest</Badge>
                )}
                {isCurrent && !isLatest && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">active</Badge>
                )}
                {isLive && (
                  <Badge variant="default" className="text-[9px] h-4 px-1.5 gap-1">
                    <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                    live
                  </Badge>
                )}
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2.5">
                {/* Contract snippet */}
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Contract</p>
                  <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950 rounded px-2 py-1.5 overflow-x-auto max-h-24 overflow-y-auto">
                    {version.contractCode.slice(0, 300)}{version.contractCode.length > 300 ? "\n…" : ""}
                  </pre>
                </div>

                {/* Deployed address */}
                {version.deployedAddress && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Deployed:</span>
                    <a
                      href={`https://sepolia.arbiscan.io/address/${version.deployedAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-green-400 hover:underline flex items-center gap-1"
                    >
                      {version.deployedAddress.slice(0, 10)}…{version.deployedAddress.slice(-6)}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}

                {/* Restore button */}
                {isOwner && !isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 w-full"
                    onClick={() => void handleRestore(version)}
                    disabled={restoring === version.id}
                  >
                    {restoring === version.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RotateCcw className="h-3 w-3" />
                    }
                    Restore this version
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
