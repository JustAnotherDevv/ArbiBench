import { Button } from "@/components/ui/button";
import { Copy, Flame, Key, LogOut, Wallet, Zap } from "lucide-react";
import { hasBurnerKey, exportBurnerPrivateKey } from "@/lib/burnerWallet";
import { toast } from "sonner";

interface HeaderProps {
  walletAddress: string | null;
  isBurner: boolean;
  onSignIn: () => void;
  onSignInBurner: () => void;
  onSignOut: () => void;
  authLoading: boolean;
}

export function Header({
  walletAddress,
  isBurner,
  onSignIn,
  onSignInBurner,
  onSignOut,
  authLoading,
}: HeaderProps) {

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      toast.success("Address copied");
    });
  };

  const exportKey = () => {
    const pk = exportBurnerPrivateKey();
    if (!pk) return;
    navigator.clipboard.writeText(pk).then(() => {
      toast.warning("Private key copied — keep it secret, never share it");
    });
  };

  return (
    <header className="border-b border-white/[0.06] px-4 py-2 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[15px] font-light tracking-tight">ArbiBench</span>
        <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase text-muted-foreground/25">
          <span className="text-border">·</span>
          Stylus dApp Builder
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Network pill */}
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-white/[0.07] px-2.5 py-1 font-mono text-[10px] text-muted-foreground/40">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          Arbitrum Sepolia
        </div>

        {/* Wallet */}
        {walletAddress ? (
          <div className="flex items-center gap-1.5">
            {/* Address pill — amber for burner, default for MetaMask */}
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              isBurner
                ? "border-amber-500/30 bg-amber-500/8 text-amber-500"
                : "border-white/[0.07]"
            }`}>
              {isBurner
                ? <Flame className="h-2.5 w-2.5" />
                : <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              }
              <span className="font-mono text-[10px]">
                {isBurner && <span className="mr-1 font-medium">Burner</span>}
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            </div>

            {/* Copy address */}
            <Button
              variant="ghost"
              size="icon"
              onClick={copyAddress}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Copy address"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>

            {/* Export private key (burner only) */}
            {isBurner && (
              <Button
                variant="ghost"
                size="icon"
                onClick={exportKey}
                className="h-7 w-7 text-amber-500/70 hover:text-amber-500"
                title="Copy private key (keep secret!)"
              >
                <Key className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Disconnect */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSignIn}
              disabled={authLoading}
              className="h-8 text-xs gap-1.5"
            >
              <Wallet className="h-3.5 w-3.5" />
              {authLoading ? "Connecting…" : "Connect Wallet"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignInBurner}
              disabled={authLoading}
              className="h-8 text-xs gap-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
            >
              <Flame className="h-3.5 w-3.5" />
              {hasBurnerKey() ? "Reconnect Burner" : "Burner Wallet"}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
