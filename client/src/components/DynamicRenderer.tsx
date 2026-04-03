import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { arbitrumSepolia } from "viem/chains";
import { parseEther, hexToString, BaseError } from "viem";
import { useWallet } from "@/contexts/WalletContext";
import type { UISchema, UISchemaNode, AbiItem } from "@/types/schema";
import { parseAbiFromRust, normalizeAbi, snakeToCamel } from "@/lib/parseAbi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface InteractiveState {
  inputValues: Record<string, string>;
  outputValues: Record<string, string>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
}

/** Encode a plain-text string as a right-zero-padded bytes32 hex value. */
function textToBytes32(text: string): `0x${string}` {
  const encoded = new TextEncoder().encode(text).slice(0, 32);
  const hex = Array.from(encoded).map(b => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

function convertArg(value: string, type: string): unknown {
  // Address — never pass empty string, use zero address as fallback
  if (type === "address") {
    const trimmed = value.trim();
    return (trimmed || "0x0000000000000000000000000000000000000000") as `0x${string}`;
  }
  // bytes32 — convert human text to right-padded hex
  if (type === "bytes32") {
    if (!value) return `0x${"00".repeat(32)}` as `0x${string}`;
    if (value.startsWith("0x") && value.length === 66) return value as `0x${string}`;
    return textToBytes32(value);
  }
  // other bytes types
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
  // Decode bytes32 hex → UTF-8 text (Stylus contracts store text as bytes32)
  if (typeof value === "string") {
    if (value.startsWith("0x") && value.length === 66) {
      try {
        const decoded = hexToString(value as `0x${string}`).replace(/\0/g, "").trim();
        if (decoded.length > 0 && /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(decoded)) return decoded;
      } catch { /* fall through to return hex */ }
    }
    return value;
  }
  if (Array.isArray(value)) {
    // Return JSON so list node can parse it back as array
    try {
      return JSON.stringify(value.map((v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch {
      return value.map(formatResult).join(", ");
    }
  }
  if (typeof value === "object") {
    try { return JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v); }
    catch { return String(value); }
  }
  return String(value);
}

/** Decode a Stylus revert — contracts return raw UTF-8 bytes, not ABI-encoded reasons. */
function decodeRevertError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";

  if (err.message.includes("User rejected") || err.message.includes("user rejected")) {
    return "Transaction rejected";
  }

  if (err instanceof BaseError) {
    let cause: unknown = err;
    while (cause instanceof BaseError) {
      const data = (cause as unknown as Record<string, unknown>).data as string | undefined;
      if (data && typeof data === "string" && data.startsWith("0x") && data.length > 2) {
        try {
          const decoded = hexToString(data as `0x${string}`).replace(/\0/g, "").trim();
          if (decoded.length > 0 && decoded.length < 500) return decoded;
        } catch { /* continue */ }
      }
      cause = (cause as BaseError).cause;
    }
    return (err as BaseError).shortMessage ?? err.message.slice(0, 200);
  }

  return err.message.slice(0, 200);
}

/** Walk a UISchemaNode tree and return all stat/list nodes (excludes itemTemplate subtrees). */
function collectAutoFetchNodes(node: UISchemaNode): UISchemaNode[] {
  const result: UISchemaNode[] = [];
  if (node.type === "stat" || node.type === "list") {
    result.push(node);
  }
  // Descend into children but NOT into itemTemplate (avoids infinite walks)
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectAutoFetchNodes(child));
    }
  }
  return result;
}

/** Resolve paramMapping → actual ABI args array. Replaces __walletAddress__ with wallet. */
function resolveMappedArgs(
  fn: AbiItem,
  paramMapping: Record<string, string>,
  walletAddress: string | null,
): unknown[] {
  return fn.inputs.map((inp) => {
    const mapped = paramMapping[inp.name];
    if (mapped === "__walletAddress__") {
      return (walletAddress ?? "") as `0x${string}`;
    }
    if (mapped !== undefined) return convertArg(mapped, inp.type);
    return convertArg("", inp.type);
  });
}

/** Deep-clone a UISchemaNode, replacing {{value}} and {{index}} tokens in content strings. */
function hydrateTemplate(node: UISchemaNode, value: string, index: number): UISchemaNode {
  const replace = (s?: string) =>
    s?.replace(/\{\{value\}\}/g, value).replace(/\{\{index\}\}/g, String(index));
  const cloned: UISchemaNode = { ...node, content: replace(node.content) };
  if (node.children) {
    cloned.children = node.children.map((c) => hydrateTemplate(c, value, index));
  }
  if (node.itemTemplate) {
    cloned.itemTemplate = hydrateTemplate(node.itemTemplate, value, index);
  }
  return cloned;
}

interface RenderContext {
  abi: AbiItem[];
  contractAddress: string;
  state: InteractiveState;
  onInput: (name: string, value: string) => void;
  onCall: (fnName: string) => void;
  publicClient: ReturnType<typeof usePublicClient>;
  sendContractTx: ReturnType<typeof useWallet>["sendContractTx"];
  onRefresh: () => void;
}

// ── Chat node helpers ─────────────────────────────────────────────────────────

function encodeMsg(text: string): bigint {
  const bytes = new TextEncoder().encode(text).slice(0, 32);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0");
  return BigInt("0x" + hex);
}

function decodeMsg(val: unknown): string {
  if (val === null || val === undefined) return "";
  let hex: string | null = null;
  if (typeof val === "bigint") {
    if (val === 0n) return "";
    hex = val.toString(16).padStart(64, "0");
  } else if (typeof val === "string" && val.startsWith("0x")) {
    hex = val.slice(2).padStart(64, "0");
  }
  if (!hex) return String(val);

  // Try to decode big-endian bytes as UTF-8 text (handles bytes32-encoded strings)
  const bytes = (hex.match(/.{2}/g) ?? []).map(h => parseInt(h, 16));
  const nullIdx = bytes.indexOf(0);
  const trimmed = nullIdx === -1 ? bytes : bytes.slice(0, nullIdx);
  if (trimmed.length > 0) {
    try {
      const text = new TextDecoder().decode(new Uint8Array(trimmed));
      if (/^[\x20-\x7E\u00A0-\uFFFF]+$/.test(text)) return text;
    } catch { /* fall through */ }
  }

  // Not printable text — show the decimal value (same as debug panel formatResult for bigint)
  if (typeof val === "bigint") return val.toString();
  return String(val);
}

function ChatNode({ node, ctx }: { node: UISchemaNode; ctx: RenderContext | null }) {
  // Stable ref — ctx changes every DynamicRenderer render (new object literal),
  // so we must NOT put it in dependency arrays. Read via ref instead.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  const countFn    = node.countFunctionName ?? "";
  const itemFn     = node.itemFunctionName ?? "";
  const postFn     = node.postFunctionName ?? "";
  const postParam  = node.postParamName ?? "";
  const payableAmt = node.postPayableAmount ?? "0";

  // fetchMessages is STABLE — depends only on node props (countFn/itemFn never change).
  // All mutable state is read via ctxRef to avoid stale closures.
  const fetchMessages = useCallback(async () => {
    const current = ctxRef.current;
    if (!current?.publicClient || !countFn || !itemFn) return;
    try {
      const count = await current.publicClient.readContract({
        address: current.contractAddress as `0x${string}`,
        abi: current.abi,
        functionName: countFn,
        args: [],
      });
      const n = Number(count as bigint);
      const results = n === 0 ? [] : await Promise.all(
        Array.from({ length: n }, (_, i) =>
          current.publicClient!.readContract({
            address: current.contractAddress as `0x${string}`,
            abi: current.abi,
            functionName: itemFn,
            args: [BigInt(i)],
          })
        )
      );
      setMessages(results.map(decodeMsg));
    } catch { /* ignore */ } finally {
      setInitialLoading(false);
    }
  }, [countFn, itemFn]); // stable — no ctx dependency

  // Fetch on mount and whenever the deployed contract address changes
  const contractAddress = ctx?.contractAddress;
  useEffect(() => {
    setInitialLoading(true);
    void fetchMessages();
  }, [contractAddress, fetchMessages]);

  // Scroll to bottom ONLY when new messages arrive (count increases), not on every refresh
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  const send = useCallback(async () => {
    const current = ctxRef.current;
    if (!current || !input.trim() || !postFn) return;
    setSending(true);
    setSendError(null);
    try {
      const postFnAbi = current.abi.find(f => f.name === postFn);
      const args = postFnAbi?.inputs.map(inp =>
        inp.name === postParam ? encodeMsg(input.trim()) : 0n
      ) ?? [encodeMsg(input.trim())];
      const hash = await current.sendContractTx({
        address: current.contractAddress as `0x${string}`,
        abi: current.abi,
        functionName: postFn,
        args,
        ...(parseFloat(payableAmt) > 0 ? { value: parseEther(payableAmt) } : {}),
      });
      await current.publicClient!.waitForTransactionReceipt({ hash });
      setInput("");
      current.onRefresh();
      await fetchMessages();
    } catch (err) {
      setSendError(decodeRevertError(err));
    } finally {
      setSending(false);
    }
  }, [input, postFn, postParam, payableAmt, fetchMessages]); // no ctx dep

  return (
    <div className="flex flex-col h-[480px] border border-border/60 rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
        {initialLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading messages...
          </div>
        )}
        {!initialLoading && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center italic py-8">
            No messages yet. Be the first!
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-card border border-border/40 px-3 py-2 text-sm shadow-sm">
              <span className="text-[10px] text-muted-foreground/50 block mb-0.5 font-mono">#{i + 1}</span>
              {msg
                ? <span>{msg}</span>
                : <span className="text-muted-foreground/40 italic text-xs">(no content)</span>
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border/40 p-3 bg-background flex flex-col gap-1.5">
        {parseFloat(payableAmt) > 0 && (
          <span className="text-[10px] text-amber-400/70 font-mono ml-0.5">{payableAmt} ETH per message</span>
        )}
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex flex-col gap-0.5">
            <Input
              placeholder={node.placeholder ?? "Write a message..."}
              value={input}
              maxLength={32}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && !sending && void send()}
              disabled={!ctx || sending}
              className="text-sm"
            />
            {input.length > 0 && (
              <span className="text-[10px] text-muted-foreground/40 text-right">{input.length}/32</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={!ctx || !input.trim() || sending}
            className="shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </div>
        {sendError && (
          <p className="text-xs text-destructive font-mono break-all">{sendError}</p>
        )}
      </div>
    </div>
  );
}

// ── Node renderer ─────────────────────────────────────────────────────────────

function renderNode(
  node: UISchemaNode,
  index: number,
  ctx: RenderContext | null,
): React.ReactNode {
  const key = `${node.type}-${index}-${node.name ?? node.functionName ?? ""}`;
  const className = (node.props?.className as string) ?? "";

  switch (node.type) {
    case "card":
      return (
        <Card key={key} className={className}>
          <CardContent className="pt-6 space-y-3">
            {node.children?.map((child, i) => renderNode(child, i, ctx))}
          </CardContent>
        </Card>
      );

    case "row":
      return (
        <div key={key} className={cn("flex flex-row gap-3 items-end flex-wrap", className)}>
          {node.children?.map((child, i) => renderNode(child, i, ctx))}
        </div>
      );

    case "column":
      return (
        <div key={key} className={cn("flex flex-col gap-3", className)}>
          {node.children?.map((child, i) => renderNode(child, i, ctx))}
        </div>
      );

    case "heading": {
      const level = (node.props?.level as number) ?? 2;
      const sizes: Record<number, string> = {
        1: "text-3xl font-bold", 2: "text-2xl font-semibold",
        3: "text-xl font-semibold", 4: "text-lg font-medium",
      };
      const cls = cn(sizes[level] ?? sizes[2], className);
      if (level === 1) return <h1 key={key} className={cls}>{node.content}</h1>;
      if (level === 3) return <h3 key={key} className={cls}>{node.content}</h3>;
      if (level === 4) return <h4 key={key} className={cls}>{node.content}</h4>;
      return <h2 key={key} className={cls}>{node.content}</h2>;
    }

    case "text": {
      const display = ctx && node.name && ctx.state.outputValues[node.name]
        ? ctx.state.outputValues[node.name]
        : node.content;
      const isResult = !!(ctx && node.name && ctx.state.outputValues[node.name]);
      return (
        <p key={key} className={cn(isResult ? "font-mono text-sm text-foreground" : "text-muted-foreground", className)}>
          {display}
        </p>
      );
    }

    case "input": {
      const isEther = (node.props?.type as string) === "ether" ||
        node.name === "eth_value" || node.name === "value" || node.name === "amount";
      // Detect bytes32 parameter so we can constrain input length
      const abiParam = ctx?.abi.flatMap(f => f.inputs).find(i => i.name === node.name);
      const isBytes32 = abiParam?.type === "bytes32";
      const currentVal = ctx?.state.inputValues[node.name ?? ""] ?? "";
      return (
        <div key={key} className="flex flex-col gap-1 flex-1">
          {isEther && (
            <Label className="text-xs text-muted-foreground">ETH amount</Label>
          )}
          <Input
            type={(node.props?.type as string) === "ether" ? "number" : (node.props?.type as string) ?? "text"}
            placeholder={(node.props?.placeholder as string) ?? (isBytes32 ? "Text (max 32 chars)" : "")}
            step={isEther ? "0.0001" : undefined}
            maxLength={isBytes32 ? 32 : undefined}
            className={className}
            value={currentVal}
            onChange={(e) => ctx && node.name && ctx.onInput(node.name, e.target.value)}
            disabled={!ctx}
          />
          {isBytes32 && currentVal.length > 0 && (
            <span className="text-[10px] text-muted-foreground/50 text-right">{currentVal.length}/32</span>
          )}
        </div>
      );
    }

    case "textarea":
      return (
        <Textarea
          key={key}
          placeholder={(node.props?.placeholder as string) ?? ""}
          className={className}
          value={ctx?.state.inputValues[node.name ?? ""] ?? ""}
          onChange={(e) => ctx && node.name && ctx.onInput(node.name!, e.target.value)}
          disabled={!ctx}
        />
      );

    case "button": {
      const fnName = node.name ?? "";
      const isLoading = ctx?.state.loading[fnName];
      const fn = ctx?.abi.find((f) => f.name === fnName);
      const isView = fn?.stateMutability === "view" || fn?.stateMutability === "pure";
      const isPayable = fn?.stateMutability === "payable";
      const hasError = ctx?.state.errors[fnName];
      const result = ctx?.state.outputValues[fnName];
      const perBtnEthKey = `__eth_${fnName}`;

      return (
        <div key={key} className="flex flex-col gap-1">
          {isPayable && ctx && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">ETH to send</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0001"
                className="h-8 text-sm"
                value={ctx.state.inputValues[perBtnEthKey] ?? ""}
                onChange={(e) => ctx.onInput(perBtnEthKey, e.target.value)}
              />
            </div>
          )}
          <Button
            variant={(node.props?.variant as "default" | "secondary" | "destructive" | "outline") ?? "default"}
            className={className}
            onClick={() => ctx && fnName && ctx.onCall(fnName)}
            disabled={!ctx || !fn || !!isLoading}
            size="sm"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{isView ? "Reading..." : "Sending tx..."}</>
            ) : (
              <>
                {node.content}
                {isView && <Badge variant="secondary" className="ml-2 text-[10px] py-0">view</Badge>}
                {isPayable && <Badge variant="outline" className="ml-2 text-[10px] py-0">payable</Badge>}
              </>
            )}
          </Button>
          {hasError && (
            <p className="text-xs text-destructive font-mono break-all">{hasError}</p>
          )}
          {result && !hasError && (
            <p className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded break-all">{result}</p>
          )}
        </div>
      );
    }

    case "select":
      return (
        <Select
          key={key}
          value={ctx?.state.inputValues[node.name ?? ""] ?? ""}
          onValueChange={(v) => ctx && node.name && ctx.onInput(node.name, v)}
          disabled={!ctx}
        >
          <SelectTrigger className={className}>
            <SelectValue placeholder={(node.props?.placeholder as string) ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {node.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "badge":
      return (
        <Badge
          key={key}
          variant={(node.props?.variant as "default" | "secondary" | "destructive" | "outline") ?? "default"}
          className={cn("w-fit", className)}
        >
          {node.content}
        </Badge>
      );

    case "separator":
      return <Separator key={key} className={className} />;

    case "label":
      return <Label key={key} className={className}>{node.content}</Label>;

    case "stat": {
      const fnName = node.functionName ?? "";
      const stateKey = `auto_${fnName}`;
      const val = ctx?.state.outputValues[stateKey];
      const isLoading = ctx?.state.loading[stateKey];
      return (
        <div key={key} className={cn("flex flex-col gap-0.5 min-w-[80px]", className)}>
          <span className="text-xs text-muted-foreground">{node.label ?? fnName.replace(/_/g, " ")}</span>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />
          ) : (
            <span className="text-lg font-semibold font-mono leading-tight">{val ?? "—"}</span>
          )}
        </div>
      );
    }

    case "list": {
      const fnName = node.functionName ?? "";
      const stateKey = `auto_${fnName}`;
      const raw = ctx?.state.outputValues[stateKey];
      const isLoading = ctx?.state.loading[stateKey];

      if (isLoading) {
        return (
          <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        );
      }

      let items: string[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            items = parsed.map(String);
          } else {
            items = [String(parsed)];
          }
        } catch {
          items = raw.split(", ").filter(Boolean);
        }
      }

      if (items.length === 0) {
        return (
          <p key={key} className={cn("text-xs text-muted-foreground italic", className)}>
            {node.emptyMessage ?? "No items."}
          </p>
        );
      }

      return (
        <div key={key} className={cn("flex flex-col gap-1.5", className)}>
          {items.map((item, i) => {
            if (node.itemTemplate) {
              const hydrated = hydrateTemplate(node.itemTemplate, item, i);
              return <div key={i}>{renderNode(hydrated, i, ctx)}</div>;
            }
            return (
              <p key={i} className="text-xs font-mono bg-muted px-2 py-1 rounded">{item}</p>
            );
          })}
        </div>
      );
    }

    case "chat":
      return <ChatNode key={key} node={node} ctx={ctx} />;

    default:
      return null;
  }
}

interface DynamicRendererProps {
  schema: UISchema;
  contractAddress?: string;
  abi?: AbiItem[];
  contractCode?: string;
  walletAddress?: string | null;
}

export function DynamicRenderer({ schema, contractAddress, abi, contractCode, walletAddress }: DynamicRendererProps) {
  const [state, setState] = useState<InteractiveState>({
    inputValues: {},
    outputValues: {},
    loading: {},
    errors: {},
  });

  const [refreshTick, setRefreshTick] = useState(0);

  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: arbitrumSepolia.id });
  const { sendContractTx, isBurner } = useWallet();

  const resolvedAbi = useMemo<AbiItem[]>(() => {
    // Source-parsed ABI is the single source of truth (same as DebugPanel).
    // Never use the stored LLM ABI — it may contain hallucinated functions or wrong signatures.
    if (contractCode) return parseAbiFromRust(contractCode);
    return normalizeAbi(abi ?? []);
  }, [abi, contractCode]);

  const isDeployed = !!contractAddress;
  const isLive = isDeployed && resolvedAbi.length > 0;

  // Keep stable ref to avoid stale closure issues in autoFetch
  const publicClientRef = useRef(publicClient);
  const resolvedAbiRef = useRef(resolvedAbi);
  const walletAddressRef = useRef(walletAddress);
  publicClientRef.current = publicClient;
  resolvedAbiRef.current = resolvedAbi;
  walletAddressRef.current = walletAddress;

  const autoFetch = useCallback(async (node: UISchemaNode) => {
    const fnName = snakeToCamel(node.functionName ?? "");
    if (!fnName || !contractAddress || !publicClientRef.current) return;

    const fn = resolvedAbiRef.current.find((f) => f.name === fnName && f.type === "function");
    if (!fn) return;

    const stateKey = `auto_${fnName}`;
    setState((prev) => ({
      ...prev,
      loading: { ...prev.loading, [stateKey]: true },
    }));

    try {
      const args = resolveMappedArgs(fn, node.paramMapping ?? {}, walletAddressRef.current ?? null);
      const result = await publicClientRef.current.readContract({
        address: contractAddress as `0x${string}`,
        abi: resolvedAbiRef.current,
        functionName: fnName,
        args,
      });
      setState((prev) => ({
        ...prev,
        outputValues: { ...prev.outputValues, [stateKey]: formatResult(result) },
        loading: { ...prev.loading, [stateKey]: false },
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        loading: { ...prev.loading, [stateKey]: false },
      }));
    }
  }, [contractAddress]);

  // Auto-fetch all stat/list nodes on mount and after each write (refreshTick)
  useEffect(() => {
    if (!isLive) return;
    const autoNodes = collectAutoFetchNodes(schema.layout);
    for (const node of autoNodes) {
      void autoFetch(node);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, refreshTick, walletAddress, contractAddress]);

  const onInput = useCallback((name: string, value: string) => {
    setState((prev) => ({
      ...prev,
      inputValues: { ...prev.inputValues, [name]: value },
    }));
  }, []);

  const onCall = useCallback(async (rawFnName: string) => {
    if (!contractAddress || !publicClient) return;
    const fnName = snakeToCamel(rawFnName);

    const fn = resolvedAbi.find((f) => f.name === fnName && f.type === "function");
    if (!fn) return;

    setState((prev) => ({
      ...prev,
      loading: { ...prev.loading, [fnName]: true },
      errors: { ...prev.errors, [fnName]: "" },
      outputValues: { ...prev.outputValues, [fnName]: "" },
    }));

    try {
      if (!isBurner && chainId !== arbitrumSepolia.id) {
        await switchChainAsync({ chainId: arbitrumSepolia.id });
      }

      const isView = fn.stateMutability === "view" || fn.stateMutability === "pure";
      const args = fn.inputs.map((input) =>
        convertArg(state.inputValues[input.name] ?? "", input.type)
      );

      if (isView) {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: resolvedAbi,
          functionName: fnName,
          args,
        });
        setState((prev) => ({
          ...prev,
          outputValues: { ...prev.outputValues, [fnName]: formatResult(result) },
          loading: { ...prev.loading, [fnName]: false },
        }));
      } else {
        const perBtnEthKey = `__eth_${fnName}`;
        const ethInputKeys = [perBtnEthKey, "eth_value", "value", "amount", "price", "eth"];
        const ethInput = ethInputKeys.map((k) => state.inputValues[k]).find((v) => v && v !== "");

        setState((prev) => ({
          ...prev,
          outputValues: { ...prev.outputValues, [fnName]: "Sending transaction..." },
        }));

        const hash = await sendContractTx({
          address: contractAddress as `0x${string}`,
          abi: resolvedAbi,
          functionName: fnName,
          args,
          ...(fn.stateMutability === "payable" ? { value: parseEther(ethInput || "0") } : {}),
        });

        setState((prev) => ({
          ...prev,
          outputValues: { ...prev.outputValues, [fnName]: "Waiting for confirmation..." },
        }));

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Trigger auto-refresh of all stat/list nodes
        setRefreshTick((t) => t + 1);

        setState((prev) => ({
          ...prev,
          outputValues: {
            ...prev.outputValues,
            [fnName]: `✓ Confirmed — tx: ${receipt.transactionHash.slice(0, 18)}...`,
          },
          loading: { ...prev.loading, [fnName]: false },
        }));
      }
    } catch (err) {
      const msg = decodeRevertError(err);
      setState((prev) => ({
        ...prev,
        errors: { ...prev.errors, [fnName]: msg },
        outputValues: { ...prev.outputValues, [fnName]: "" },
        loading: { ...prev.loading, [fnName]: false },
      }));
    }
  }, [contractAddress, resolvedAbi, state.inputValues, chainId, switchChainAsync, publicClient, sendContractTx, isBurner]);

  const ctx: RenderContext | null = isLive
    ? {
        abi: resolvedAbi,
        contractAddress: contractAddress!,
        state,
        onInput,
        onCall,
        publicClient: publicClient!,
        sendContractTx,
        onRefresh: () => setRefreshTick(t => t + 1),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{schema.title}</h2>
          {schema.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{schema.description}</p>
          )}
        </div>
        {isLive ? (
          <Badge variant="default" className="text-xs gap-1.5 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </Badge>
        ) : isDeployed ? (
          <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30 shrink-0">
            ABI missing
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs shrink-0">
            Preview only
          </Badge>
        )}
      </div>

      {/* Deploy nudge */}
      {!isDeployed && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5">
          <span className="text-base">🚀</span>
          <div>
            <p className="text-xs font-medium">Deploy to activate</p>
            <p className="text-[11px] text-muted-foreground">
              Click Deploy in the chat panel to connect this UI to a live contract.
            </p>
          </div>
        </div>
      )}

      {/* UI */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-5">
        {renderNode(schema.layout, 0, ctx)}
      </div>
    </div>
  );
}
