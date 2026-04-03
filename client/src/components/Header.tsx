import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, LogOut, Wallet } from "lucide-react";

interface HeaderProps {
  walletAddress: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  authLoading: boolean;
}

export function Header({
  walletAddress,
  onSignIn,
  onSignOut,
  authLoading,
}: HeaderProps) {
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

  const truncatedWallet = walletAddress
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
      </div>

      <div className="flex items-center gap-4 text-sm">
        {registrationTx && (
          <a
            href={`https://sepolia.arbiscan.io/tx/${registrationTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <span>Agent Registration TX:</span>
            <span className="font-mono">
              {registrationTx.slice(0, 10)}...{registrationTx.slice(-6)}
            </span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

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
            title="Agent wallet"
          >
            Agent: {truncatedAgent}
          </a>
        )}

        {walletAddress ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">
              {truncatedWallet}
            </span>
            <Button variant="ghost" size="sm" onClick={onSignOut} title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onSignIn}
            disabled={authLoading}
          >
            <Wallet className="mr-2 h-3.5 w-3.5" />
            {authLoading ? "Connecting..." : "Connect Wallet"}
          </Button>
        )}
      </div>
    </header>
  );
}
