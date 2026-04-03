import { Badge } from "@/components/ui/badge";

export function Header() {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">ArbitrumBench</h1>
        <Badge variant="secondary" className="text-xs">
          No-Code Builder
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-green-500" />
        Arbitrum Sepolia
      </div>
    </header>
  );
}
