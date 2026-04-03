import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractEditor } from "@/components/ContractEditor";
import { SchemaEditor } from "@/components/SchemaEditor";
import { DynamicRenderer } from "@/components/DynamicRenderer";
import { ProjectSettings } from "@/components/ProjectSettings";
import { VersionHistory } from "@/components/VersionHistory";
import { DebugPanel } from "@/components/DebugPanel";
import { Button } from "@/components/ui/button";
import {
  Save, ExternalLink, Circle, Play, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Loader2, X, Settings, History, Globe, EyeOff, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { App, UISchema, AbiItem } from "@/types/schema";

interface CodePanelProps {
  app: App;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
  onContractCodeChange: (v: string) => void;
  onCargoTomlChange: (v: string) => void;
  onUiSchemaChange: (v: UISchema) => void;
  onSave: () => Promise<void>;
  onSaveSettings: (patch: Partial<App>) => Promise<void>;
  onVersionRestored: () => void;
  onPublish?: () => Promise<void>;
  onUnpublish?: () => Promise<void>;
  isOwner: boolean;
  saving: boolean;
  dirty: boolean;
  walletAddress: string | null;
}

type CompileStatus = "idle" | "running" | "success" | "error";

interface CompileState {
  status: CompileStatus;
  logs: string[];
  errors: string;
  open: boolean;
}

const STATUS_DOT: Record<string, string> = {
  draft:     "bg-zinc-400",
  building:  "bg-blue-400 animate-pulse",
  deploying: "bg-amber-400 animate-pulse",
  deployed:  "bg-green-400",
  failed:    "bg-red-500",
};

const TAB_CLS =
  "h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary " +
  "text-xs px-3 text-muted-foreground data-[state=active]:text-foreground " +
  "data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5 shrink-0";

export function CodePanel({
  app,
  contractCode,
  cargoToml,
  uiSchema,
  abi,
  onContractCodeChange,
  onCargoTomlChange,
  onUiSchemaChange,
  onSave,
  onSaveSettings,
  onVersionRestored,
  onPublish,
  onUnpublish,
  isOwner,
  saving,
  dirty,
  walletAddress,
}: CodePanelProps) {
  const isDeployed = !!app.deployedAddress;
  const isPublished = app.published ?? false;
  const abortRef = useRef<AbortController | null>(null);
  const [publishing, setPublishing] = useState(false);

  const handlePublishToggle = async () => {
    setPublishing(true);
    try {
      if (isPublished) await onUnpublish?.();
      else await onPublish?.();
    } finally {
      setPublishing(false);
    }
  };

  const [compile, setCompile] = useState<CompileState>({
    status: "idle", logs: [], errors: "", open: false,
  });

  const handleCompile = async () => {
    if (!walletAddress) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCompile({ status: "running", logs: [], errors: "", open: true });

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress },
        body: JSON.stringify({ contractCode, cargoToml }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as { type: string; line?: string; errors?: string };
            if (event.type === "done") break;
            if (event.type === "log" && event.line)
              setCompile((p) => ({ ...p, logs: [...p.logs, event.line!] }));
            else if (event.type === "success")
              setCompile((p) => ({ ...p, status: "success" }));
            else if (event.type === "error")
              setCompile((p) => ({ ...p, status: "error", errors: event.errors ?? "Build failed" }));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setCompile((p) => ({
          ...p, status: "error",
          errors: err instanceof Error ? err.message : "Compile failed",
        }));
      }
    }
  };

  const compileIcon =
    compile.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" />
    : compile.status === "success" ? <CheckCircle2 className="h-3 w-3 text-green-400" />
    : compile.status === "error" ? <XCircle className="h-3 w-3 text-red-400" />
    : <Play className="h-3 w-3" />;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Row 1: Action bar ── */}
      <div className="flex items-center justify-between px-3 h-10 shrink-0 border-b border-border/60 bg-card/30">
        {/* Left: status + name + deployed address */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[app.status] ?? "bg-zinc-400")} />
          <span className="text-xs font-medium text-foreground/80 truncate max-w-[160px]">
            {app.name}
          </span>
          {app.deployedAddress && (
            <>
              <span className="text-border/60 text-xs shrink-0">·</span>
              <a
                href={`https://sepolia.arbiscan.io/address/${app.deployedAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary font-mono transition-colors shrink-0"
              >
                {app.deployedAddress.slice(0, 6)}…{app.deployedAddress.slice(-4)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCompile}
            disabled={compile.status === "running" || !walletAddress}
            className={cn(
              "h-7 text-xs gap-1.5 px-2.5",
              compile.status === "success" && "text-green-400 hover:text-green-300",
              compile.status === "error" && "text-red-400 hover:text-red-300",
            )}
          >
            {compileIcon}
            {compile.status === "running" ? "Compiling…" : "Compile"}
          </Button>

          {isDeployed && (onPublish || onUnpublish) && (
            <Button
              size="sm"
              variant={isPublished ? "default" : "outline"}
              onClick={handlePublishToggle}
              disabled={publishing}
              className={cn(
                "h-7 text-xs gap-1.5 px-2.5",
                isPublished && "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white",
              )}
            >
              {publishing ? <Loader2 className="h-3 w-3 animate-spin" />
                : isPublished ? <EyeOff className="h-3 w-3" />
                : <Globe className="h-3 w-3" />}
              {publishing ? "…" : isPublished ? "Unpublish" : "Publish"}
            </Button>
          )}

          {isOwner && dirty && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSave}
              disabled={saving}
              className="h-7 text-xs gap-1.5 px-2.5"
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Row 2 + content: Tabs ── */}
      <Tabs defaultValue="preview" className="flex flex-col flex-1 overflow-hidden">
        <div className="shrink-0 border-b border-border/60">
          <TabsList className="h-9 bg-transparent gap-0 p-0 rounded-none w-full justify-start">
            <TabsTrigger value="preview" className={TAB_CLS}>
              Preview
              {isDeployed && <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="contract" className={TAB_CLS}>
              Code
              {dirty && <Circle className="h-1.5 w-1.5 fill-primary text-primary" />}
            </TabsTrigger>
            <TabsTrigger value="cargo" className={TAB_CLS}>Cargo</TabsTrigger>
            <TabsTrigger value="schema" className={TAB_CLS}>UI</TabsTrigger>
            <TabsTrigger value="debug" className={TAB_CLS}>
              <Terminal className="h-3 w-3" />
              Debug
              {isDeployed && <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="settings" className={TAB_CLS}>
              <Settings className="h-3 w-3" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="versions" className={TAB_CLS}>
              <History className="h-3 w-3" />
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="preview" className="h-full m-0 p-5">
            <div className="h-full overflow-auto">
              <DynamicRenderer
                schema={uiSchema}
                contractAddress={app.deployedAddress}
                abi={abi}
                contractCode={contractCode}
                walletAddress={walletAddress}
              />
            </div>
          </TabsContent>

          <TabsContent value="contract" className="h-full m-0 p-4">
            <ContractEditor code={contractCode} onChange={onContractCodeChange} language="rust" />
          </TabsContent>

          <TabsContent value="cargo" className="h-full m-0 p-4">
            <ContractEditor code={cargoToml} onChange={onCargoTomlChange} language="toml" />
          </TabsContent>

          <TabsContent value="schema" className="h-full m-0 p-4">
            <SchemaEditor schema={uiSchema} onChange={onUiSchemaChange} />
          </TabsContent>

          <TabsContent value="debug" className="h-full m-0 overflow-hidden">
            <DebugPanel
              abi={abi}
              contractCode={contractCode}
              contractAddress={app.deployedAddress}
              walletAddress={walletAddress}
            />
          </TabsContent>

          <TabsContent value="settings" className="h-full m-0 overflow-auto">
            <ProjectSettings app={app} isOwner={isOwner} onSave={onSaveSettings} />
          </TabsContent>

          <TabsContent value="versions" className="h-full m-0 overflow-auto">
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Version History</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Snapshots saved after each successful build. Restore any version to update the active code.
                </p>
              </div>
              <VersionHistory
                app={app}
                isOwner={isOwner}
                walletAddress={walletAddress}
                onRestored={onVersionRestored}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* ── Compile log panel ── */}
      {compile.open && (
        <div className={cn(
          "shrink-0 border-t overflow-hidden",
          compile.status === "success" ? "border-green-500/20"
          : compile.status === "error" ? "border-red-500/20"
          : "border-border/60",
        )}>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/5 transition-colors",
              compile.status === "success" ? "bg-green-500/5"
              : compile.status === "error" ? "bg-red-500/5"
              : "bg-card/30",
            )}
            onClick={() => setCompile((p) => ({ ...p, open: !p.open }))}
          >
            {compileIcon}
            <span className="flex-1 font-mono text-muted-foreground">
              {compile.status === "running" ? "Compiling…"
                : compile.status === "success" ? "Build passed ✓"
                : compile.status === "error" ? "Build failed"
                : "Compile output"}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setCompile((p) => ({ ...p, open: !p.open })); }}
              className="text-muted-foreground/50 hover:text-muted-foreground"
            >
              {compile.open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setCompile((p) => ({ ...p, open: false })); }}
              className="text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <CompileLogs logs={compile.logs} errors={compile.errors} status={compile.status} />
        </div>
      )}
    </div>
  );
}

function CompileLogs({ logs, errors, status }: { logs: string[]; errors: string; status: CompileStatus }) {
  const endRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);
  if (logs.length !== prevLen.current) {
    prevLen.current = logs.length;
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  return (
    <div className="max-h-48 overflow-y-auto bg-zinc-950 px-3 py-2">
      <pre className="text-[10.5px] font-mono leading-relaxed text-zinc-400 whitespace-pre-wrap break-all">
        {logs.join("\n") || "Waiting for output…"}
      </pre>
      {errors && status === "error" && (
        <pre className="mt-2 pt-2 border-t border-red-500/20 text-[10.5px] font-mono leading-relaxed text-red-400 whitespace-pre-wrap break-all">
          {errors}
        </pre>
      )}
      <div ref={endRef} />
    </div>
  );
}
