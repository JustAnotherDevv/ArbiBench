import { useState, useCallback, useMemo } from "react";
import { usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { arbitrumSepolia } from "viem/chains";
import { parseEther, hexToString, BaseError } from "viem";
import { useWallet } from "@/contexts/WalletContext";
import type { AbiItem } from "@/types/schema";
import { parseAbiFromRust, normalizeAbi } from "@/lib/parseAbi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Arg conversion (mirrors DynamicRenderer) ──────────────────────────────────

function textToBytes32(text: string): `0x${string}` {
  const encoded = new TextEncoder().encode(text).slice(0, 32);
  const hex = Array.from(encoded).map(b => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

function convertArg(value: string, type: string): unknown {
  if (type === "address") {
    const t = value.trim();
    return (t || "0x0000000000000000000000000000000000000000") as `0x${string}`;
  }
  if (type === "bytes32") {
    if (!value) return `0x${"00".repeat(32)}` as `0x${string}`;
    if (value.startsWith("0x") && value.length === 66) return value as `0x${string}`;
    return textToBytes32(value);
  }
  if (type.startsWith("bytes")) {
    if (!value) return "0x" as `0x${string}`;
    if (value.startsWith("0x")) return value as `0x${string}`;
    return textToBytes32(value);
  }
  if (!value) return type.startsWith("uint") || type.startsWith("int") ? 0n : value;
  if (type === "bool") return value === "true" || value === "1";
  if (type.startsWith("uint") || type.startsWith("int")) {
    try { return BigInt(value); } catch { return 0n; }
  }
  return value;
}

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    if (value.startsWith("0x") && value.length === 66) {
      try {
        const decoded = hexToString(value as `0x${string}`).replace(/\0/g, "").trim();
        if (decoded.length > 0 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)) return decoded;
      } catch { /* keep hex */ }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formatResult).join(", ");
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v); }
    catch { return String(value); }
  }
  return String(value);
}

function decodeRevert(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown error";
  if (err.message.includes("User rejected") || err.message.includes("user rejected")) return "Rejected";
  if (err instanceof BaseError) {
    let cause: unknown = err;
    while (cause instanceof BaseError) {
      const data = (cause as unknown as Record<string, unknown>).data as string | undefined;
      if (data && typeof data === "string" && data.startsWith("0x") && data.length > 2) {
        try {
          const decoded = hexToString(data as `0x${string}`).replace(/\0/g, "").trim();
          if (decoded.length > 0 && decoded.length < 300) return decoded;
        } catch { /* continue */ }
      }
      cause = (cause as BaseError).cause;
    }
    return (err as BaseError).shortMessage ?? err.message.slice(0, 200);
  }
  return err.message.slice(0, 200);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DebugPanelProps {
  abi: AbiItem[];
  contractCode?: string;
  contractAddress?: string;
  walletAddress?: string | null;
}

// ── Single function row ───────────────────────────────────────────────────────

interface FnRowProps {
  fn: AbiItem;
  contractAddress: string;
  walletAddress: string | null;
}

function FnRow({ fn, contractAddress, walletAddress }: FnRowProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [ethValue, setEthValue] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: arbitrumSepolia.id });
  const { sendContractTx, isBurner } = useWallet();

  const isView = fn.stateMutability === "view" || fn.stateMutability === "pure";
  const isPayable = fn.stateMutability === "payable";

  const call = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    setOutput(null);
    setError(null);

    try {
      if (!isBurner && chainId !== arbitrumSepolia.id) {
        await switchChainAsync({ chainId: arbitrumSepolia.id });
      }

      const args = fn.inputs.map(inp => convertArg(inputs[inp.name] ?? "", inp.type));

      if (isView) {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: [fn],
          functionName: fn.name,
          args,
        });
        setOutput(formatResult(result));
      } else {
        const hash = await sendContractTx({
          address: contractAddress as `0x${string}`,
          abi: [fn],
          functionName: fn.name,
          args,
          ...(isPayable ? { value: parseEther(ethValue || "0") } : {}),
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        setOutput(`✓ ${receipt.transactionHash.slice(0, 20)}…`);
      }
    } catch (err) {
      setError(decodeRevert(err));
    } finally {
      setLoading(false);
    }
  }, [fn, inputs, ethValue, contractAddress, publicClient, sendContractTx, isBurner, isView, isPayable, chainId, switchChainAsync]);

  return (
    <div className="group px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-white/[0.02] transition-colors">
      {/* Function header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[12px] text-foreground/90 font-medium">{fn.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1.5 py-0 h-4 rounded font-mono",
            isView ? "border-blue-500/30 text-blue-400"
              : isPayable ? "border-amber-500/30 text-amber-400"
              : "border-purple-500/30 text-purple-400",
          )}
        >
          {fn.stateMutability}
        </Badge>
      </div>

      {/* Inputs row */}
      <div className="flex items-end gap-2 flex-wrap">
        {isPayable && (
          <div className="flex flex-col gap-0.5 min-w-[90px]">
            <span className="text-[9px] font-mono text-amber-400/70">ETH value</span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.0"
              value={ethValue}
              onChange={e => setEthValue(e.target.value)}
              className="h-6 text-[11px] font-mono px-2 w-[90px]"
            />
          </div>
        )}

        {fn.inputs.map(inp => {
          const isBytes32 = inp.type === "bytes32";
          const val = inputs[inp.name] ?? "";
          return (
            <div key={inp.name} className="flex flex-col gap-0.5 min-w-[90px] flex-1 max-w-[200px]">
              <span className="text-[9px] font-mono text-muted-foreground/60">
                {inp.name}
                <span className="text-muted-foreground/30 ml-1">:{inp.type}</span>
              </span>
              <Input
                placeholder={isBytes32 ? "text (max 32)" : inp.type}
                maxLength={isBytes32 ? 32 : undefined}
                value={val}
                onChange={e => setInputs(p => ({ ...p, [inp.name]: e.target.value }))}
                className="h-6 text-[11px] font-mono px-2"
              />
            </div>
          );
        })}

        <Button
          size="sm"
          variant={isView ? "outline" : "default"}
          onClick={call}
          disabled={loading}
          className={cn(
            "h-6 text-[11px] px-2.5 gap-1 shrink-0",
            isView && "border-blue-500/20 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10",
          )}
        >
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : isView
              ? <Eye className="h-3 w-3" />
              : <Zap className="h-3 w-3" />}
          {isView ? "Call" : "Send"}
        </Button>
      </div>

      {/* Output / error */}
      {output !== null && (
        <div className="mt-1.5 px-2 py-1 rounded bg-muted/40 font-mono text-[11px] text-foreground/80 break-all">
          {output}
        </div>
      )}
      {error !== null && (
        <div className="mt-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20 font-mono text-[11px] text-red-400 break-all">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Main DebugPanel ───────────────────────────────────────────────────────────

export function DebugPanel({ abi, contractCode, contractAddress, walletAddress }: DebugPanelProps) {
  const resolvedAbi = useMemo<AbiItem[]>(() => {
    // Source-parsed ABI is the single source of truth — 1:1 with what's actually deployed
    if (contractCode) return parseAbiFromRust(contractCode);
    // No source available — fall back to stored ABI
    return normalizeAbi(abi ?? []);
  }, [abi, contractCode]);

  const viewFns = resolvedAbi.filter(f => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"));
  const writeFns = resolvedAbi
    .filter(f => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
    .sort((a, b) => (a.name === "init" ? -1 : b.name === "init" ? 1 : 0)); // init always first

  if (resolvedAbi.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 text-muted-foreground/50">
        <AlertTriangle className="h-6 w-6" />
        <p className="text-xs">No ABI available. Build the contract first.</p>
      </div>
    );
  }

  if (!contractAddress) {
    return (
      <div className="h-full overflow-auto">
        {/* Deploy nudge */}
        <div className="m-4 flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-400/80">Deploy the contract to call functions live. Showing ABI only.</p>
        </div>

        {/* Show ABI in read-only mode */}
        <AbiReadOnly fns={resolvedAbi} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur border-b border-border/40">
        <span className="text-[10px] font-mono text-muted-foreground/50 flex-1">
          {contractAddress.slice(0, 10)}…{contractAddress.slice(-6)}
        </span>
        <span className="text-[10px] text-muted-foreground/40">
          {viewFns.length}v + {writeFns.length}w fns
        </span>
      </div>

      {/* View functions */}
      {viewFns.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-[9px] font-semibold tracking-widest uppercase text-blue-400/60 bg-blue-500/5 border-b border-blue-500/10">
            View / Pure
          </div>
          {viewFns.map(fn => (
            <FnRow
              key={fn.name}
              fn={fn}
              contractAddress={contractAddress}
              walletAddress={walletAddress ?? null}
            />
          ))}
        </div>
      )}

      {/* Write functions */}
      {writeFns.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-[9px] font-semibold tracking-widest uppercase text-purple-400/60 bg-purple-500/5 border-b border-purple-500/10">
            Write / Payable
          </div>
          {writeFns.map(fn => (
            <FnRow
              key={fn.name}
              fn={fn}
              contractAddress={contractAddress}
              walletAddress={walletAddress ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ABI read-only display (pre-deploy) ────────────────────────────────────────

function AbiReadOnly({ fns }: { fns: AbiItem[] }) {
  return (
    <div className="px-3 py-2 space-y-1">
      {fns.filter(f => f.type === "function").map(fn => (
        <div key={fn.name} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
          <span className="font-mono text-[11px] text-foreground/70">{fn.name}</span>
          {fn.inputs.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/50">
              ({fn.inputs.map(i => `${i.name}: ${i.type}`).join(", ")})
            </span>
          )}
          <Badge variant="outline" className={cn(
            "ml-auto text-[9px] px-1.5 py-0 h-4 rounded font-mono",
            fn.stateMutability === "view" || fn.stateMutability === "pure"
              ? "border-blue-500/20 text-blue-400/70"
              : fn.stateMutability === "payable"
                ? "border-amber-500/20 text-amber-400/70"
                : "border-purple-500/20 text-purple-400/70",
          )}>
            {fn.stateMutability}
          </Badge>
        </div>
      ))}
    </div>
  );
}
