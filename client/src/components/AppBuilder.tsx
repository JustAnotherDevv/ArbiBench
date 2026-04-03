import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AppBuilderProps {
  onGenerate: (description: string) => void;
  loading: boolean;
}

export function AppBuilder({ onGenerate, loading }: AppBuilderProps) {
  const [description, setDescription] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Describe Your dApp</CardTitle>
        <CardDescription>
          Tell us what you want to build on Arbitrum and we'll generate the smart
          contract and UI for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Textarea
          placeholder="e.g. A tip jar where users can send ETH tips with messages, and the owner can withdraw..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="resize-none"
        />
        <Button
          onClick={() => onGenerate(description)}
          disabled={!description.trim() || loading}
          className="w-full"
        >
          {loading ? "Generating..." : "Generate dApp"}
        </Button>
      </CardContent>
    </Card>
  );
}
