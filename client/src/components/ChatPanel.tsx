import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronRight,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Sparkles,
  Terminal,
  Rocket,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { App, ChatItem } from "@/types/schema";

const EXAMPLE_PROMPTS = [
  "ERC-20 token with mint and burn, 1M max supply",
  "NFT that mints for 0.01 ETH, max 100",
  "Tip jar that splits ETH between two addresses",
  "Simple voting contract with proposals",
];

interface ChatPanelProps {
  items: ChatItem[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onRetry?: () => void;
  onDeploy?: () => void;
  currentApp: App | null;
  hasCode: boolean;
}

function BuildSection({
  logs,
  status,
  attempt,
  errors,
}: {
  logs: string[];
  status: "running" | "success" | "error";
  attempt: number;
  errors?: string;
}) {
  const [open, setOpen] = useState(status === "error");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, open]);

  const icon =
    status === "running" ? (
      <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
    ) : status === "success" ? (
      <CheckCircle2 className="h-3 w-3 text-green-400" />
    ) : (
      <XCircle className="h-3 w-3 text-red-400" />
    );

  const label =
    status === "running"
      ? `Compiling… (attempt ${attempt + 1})`
      : status === "success"
      ? "Build passed"
      : `Build failed (attempt ${attempt + 1})`;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden text-xs",
        status === "success"
          ? "border-green-500/20 bg-green-500/5"
          : status === "error"
          ? "border-red-500/20 bg-red-500/5"
          : "border-border bg-card/50",
      )}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
      >
        {icon}
        <span className="flex-1 text-left font-mono text-muted-foreground">{label}</span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/50 p-3 max-h-56 overflow-y-auto">
          <pre className="font-mono leading-relaxed text-zinc-400 whitespace-pre-wrap break-all text-[10px]">
            {logs.join("\n") || "No output yet…"}
          </pre>
          {errors && status === "error" && (
            <div className="mt-2 pt-2 border-t border-red-500/20">
              <pre className="font-mono text-red-400 whitespace-pre-wrap break-all text-[10px]">
                {errors}
              </pre>
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}

function DeploySection({
  icon, label, logs, status, error, address,
}: {
  icon: React.ReactNode;
  label: string;
  logs: string[];
  status: "running" | "success" | "error";
  error?: string;
  address?: string;
}) {
  const [open, setOpen] = useState(status === "error");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, open]);

  return (
    <div className="pl-8">
      <div className={cn(
        "rounded-lg border overflow-hidden text-xs",
        status === "success" ? "border-green-500/20 bg-green-500/5"
          : status === "error" ? "border-red-500/20 bg-red-500/5"
          : "border-blue-500/20 bg-blue-500/5",
      )}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
        >
          {icon}
          <span className="flex-1 text-left font-mono text-muted-foreground">{label}</span>
          {address && status === "success" && (
            <a
              href={`https://sepolia.arbiscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-primary hover:underline font-mono"
            >
              arbiscan ↗
            </a>
          )}
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground/50" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
        </button>
        {open && (
          <div className="border-t border-border/50 p-3 max-h-56 overflow-y-auto bg-zinc-950">
            <pre className="font-mono leading-relaxed text-zinc-400 whitespace-pre-wrap break-all text-[10px]">
              {logs.join("\n") || "Waiting for output…"}
            </pre>
            {error && status === "error" && (
              <pre className="mt-2 pt-2 border-t border-red-500/20 text-[10px] font-mono text-red-400 whitespace-pre-wrap break-all">
                {error}
              </pre>
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatItemRenderer({ item, onRetry }: { item: ChatItem; onRetry?: () => void }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5">
          <p className="text-sm text-primary-foreground leading-relaxed">{item.text}</p>
        </div>
      </div>
    );
  }

  if (item.kind === "thinking") {
    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 max-w-[85%]">
          <p className="text-sm text-muted-foreground italic">{item.message}</p>
        </div>
      </div>
    );
  }

  if (item.kind === "code_update") {
    const lines = item.contractCode.split("\n").length;
    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
          <Sparkles className="h-3 w-3 text-violet-400" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
          <p className="text-sm">
            Generated{" "}
            <span className="font-mono text-violet-400 font-medium">{lines}</span>
            {" "}lines of Rust
          </p>
          {item.uiSchema?.title && (
            <p className="text-xs text-muted-foreground mt-0.5">{item.uiSchema.title}</p>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "build_section") {
    return (
      <div className="pl-8">
        <BuildSection
          logs={item.logs}
          status={item.status}
          attempt={item.attempt}
          errors={item.errors}
        />
      </div>
    );
  }

  if (item.kind === "fix") {
    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <Wrench className="h-3 w-3 text-amber-400" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
          <p className="text-sm">
            Fixing errors{" "}
            <span className="text-muted-foreground text-xs">(attempt {item.attempt}/3)</span>
          </p>
        </div>
      </div>
    );
  }

  if (item.kind === "app_saved") {
    const isFailed = item.app.status === "failed";
    const isDeployed = item.app.status === "deployed";
    return (
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isFailed ? "bg-red-500/15" : "bg-green-500/15"}`}>
          {isFailed
            ? <XCircle className="h-3 w-3 text-red-400" />
            : <CheckCircle2 className="h-3 w-3 text-green-400" />}
        </div>
        <div className={`rounded-2xl rounded-tl-sm border px-3.5 py-2.5 ${isFailed ? "border-red-500/20 bg-red-500/8" : "border-green-500/20 bg-green-500/8"}`}>
          <p className={`text-sm font-medium ${isFailed ? "text-red-400" : "text-green-400"}`}>
            {isFailed ? `${item.app.name} — build failed` : `${item.app.name} ready`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isFailed
              ? "Contract could not be compiled. Check the build logs above."
              : isDeployed
              ? `Deployed at ${item.app.deployedAddress?.slice(0, 10)}…`
              : "Compiled successfully — click Deploy to go live"}
          </p>
        </div>
      </div>
    );
  }

  if (item.kind === "deploy_section") {
    const icon =
      item.status === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
      ) : item.status === "success" ? (
        <CheckCircle2 className="h-3 w-3 text-green-400" />
      ) : (
        <XCircle className="h-3 w-3 text-red-400" />
      );
    const label =
      item.status === "running"
        ? "Deploying to Arbitrum Sepolia…"
        : item.status === "success"
        ? `Deployed — ${item.app?.deployedAddress?.slice(0, 10)}…`
        : `Deployment failed`;

    return (
      <DeploySection
        icon={icon}
        label={label}
        logs={item.logs}
        status={item.status}
        error={item.error}
        address={item.app?.deployedAddress}
      />
    );
  }

  if (item.kind === "error") {
    return (
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/15">
          <XCircle className="h-3 w-3 text-red-400" />
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 space-y-2 max-w-[85%]">
          <p className="text-sm text-red-400 break-words">{item.message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-red-300/70 underline underline-offset-2 hover:text-red-300 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function ChatPanel({
  items,
  isStreaming,
  onSend,
  onRetry,
  onDeploy,
  currentApp,
  hasCode,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = items.length === 0;
  const isDeployed = currentApp?.status === "deployed";
  const canDeploy = onDeploy && currentApp && !isDeployed;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0 h-10">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-light truncate">
            {currentApp?.name ?? "New App"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDeployed && currentApp.deployedAddress && (
            <a
              href={`https://sepolia.arbiscan.io/address/${currentApp.deployedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-mono text-green-400 hover:text-green-300 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {currentApp.deployedAddress.slice(0, 6)}…{currentApp.deployedAddress.slice(-4)}
            </a>
          )}
          {canDeploy && (
            <Button
              size="sm"
              onClick={onDeploy}
              disabled={
                isStreaming ||
                currentApp.status === "deploying" ||
                currentApp.status === "building"
              }
              className="h-7 text-xs gap-1.5 px-2.5"
            >
              <Rocket className="h-3 w-3" />
              Deploy
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-5 py-8">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">
                {hasCode ? "Request changes" : "Describe your dApp"}
              </p>
              <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
                {hasCode
                  ? "Tell the agent what to add, change, or fix"
                  : "The agent generates a Stylus contract + UI and compiles it"}
              </p>
            </div>
            {!hasCode && (
              <div className="w-full space-y-1.5">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => onSend(prompt)}
                    disabled={isStreaming}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors group"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            {items.map((item, i) => (
              <ChatItemRenderer
                key={i}
                item={item}
                onRetry={item.kind === "error" ? onRetry : undefined}
              />
            ))}
            {isStreaming && items[items.length - 1]?.kind !== "thinking" && (
              <div className="flex items-center gap-2 text-muted-foreground pl-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Working…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] p-2.5">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasCode
                ? "Request changes…"
                : "Describe your Arbitrum dApp…"
            }
            rows={1}
            className="resize-none text-sm overflow-hidden"
            style={{ minHeight: "38px", maxHeight: "160px" }}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 h-9 w-9"
          >
            {isStreaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
