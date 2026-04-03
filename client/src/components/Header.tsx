import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface HeaderProps {
  walletAddress: string;
}

export function Header({ walletAddress }: HeaderProps) {
  const [registrationTx, setRegistrationTx] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setRegistrationTx(data.registrationTx ?? null);
        setAgentAddress(data.agentAddress ?? null);
      })
      .catch(() => {});
  }, []);

  const truncated = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "";

  const truncatedAgent = agentAddress
    ? `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`
    : null;

  return (
    <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">ArbiBench</h1>
        <Badge variant="secondary" className="text-xs">
          Stylus Builder
        </Badge>
        {registrationTx && (
          <a
            href={`https://sepolia.arbiscan.io/tx/${registrationTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Badge variant="outline" className="text-[10px] gap-1">
              Agent Registered
              <ExternalLink className="h-2.5 w-2.5" />
            </Badge>
          </a>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          Arbitrum Sepolia
        </div>
        {truncatedAgent && (
          <a
            href={`https://sepolia.arbiscan.io/address/${agentAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {truncatedAgent}
          </a>
        )}
        {truncated && (
          <span className="font-mono text-xs text-muted-foreground">
            {truncated}
          </span>
        )}
      </div>
    </header>
  );
}
