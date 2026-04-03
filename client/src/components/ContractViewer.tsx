import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ContractViewerProps {
  contract: string;
}

export function ContractViewer({ contract }: ContractViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Smart Contract</CardTitle>
          <CardDescription>Solidity ^0.8.19 for Arbitrum</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="overflow-auto rounded-lg bg-background p-4 text-sm leading-relaxed">
          <code>{contract}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
