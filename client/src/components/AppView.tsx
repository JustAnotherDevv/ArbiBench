import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractEditor } from "@/components/ContractEditor";
import { SchemaEditor } from "@/components/SchemaEditor";
import { DynamicRenderer } from "@/components/DynamicRenderer";
import { ExternalLink, RotateCcw, Save, Rocket, Trash2 } from "lucide-react";
import type { App, UISchema } from "@/types/schema";

interface AppViewProps {
  app: App;
  onSave: (id: string, data: Partial<App>) => Promise<void>;
  onRegenerate: (description: string) => void;
  onDeploy: (id: string) => void;
  onDelete: (id: string) => void;
  deploying: boolean;
  regenerating: boolean;
}

export function AppView({
  app,
  onSave,
  onRegenerate,
  onDeploy,
  onDelete,
  deploying,
  regenerating,
}: AppViewProps) {
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description);
  const [contractCode, setContractCode] = useState(app.contractCode);
  const [cargoToml, setCargoToml] = useState(app.cargoToml);
  const [uiSchema, setUiSchema] = useState<UISchema>(app.uiSchema);
  const [saving, setSaving] = useState(false);

  // Reset local state when app changes
  useEffect(() => {
    setName(app.name);
    setDescription(app.description);
    setContractCode(app.contractCode);
    setCargoToml(app.cargoToml);
    setUiSchema(app.uiSchema);
  }, [app.id, app.updatedAt]);

  const dirty =
    name !== app.name ||
    description !== app.description ||
    contractCode !== app.contractCode ||
    cargoToml !== app.cargoToml ||
    JSON.stringify(uiSchema) !== JSON.stringify(app.uiSchema);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(app.id, {
        name,
        description,
        contractCode,
        cargoToml,
        uiSchema,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold border-none bg-transparent px-0 h-auto focus-visible:ring-0"
            placeholder="App name"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm text-muted-foreground border-none bg-transparent px-0 h-auto focus-visible:ring-0"
            placeholder="Description"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={
              app.status === "deployed"
                ? "default"
                : app.status === "failed"
                  ? "destructive"
                  : "secondary"
            }
          >
            {app.status}
          </Badge>
          {app.deployedAddress && (
            <a
              href={`https://sepolia.arbiscan.io/address/${app.deployedAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {app.deployedAddress.slice(0, 6)}...{app.deployedAddress.slice(-4)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="preview" className="flex-1">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="contract">Contract (lib.rs)</TabsTrigger>
          <TabsTrigger value="cargo">Cargo.toml</TabsTrigger>
          <TabsTrigger value="schema">UI Schema</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <div className="rounded-lg border border-border bg-card/50 p-6">
            <DynamicRenderer schema={uiSchema} />
          </div>
        </TabsContent>

        <TabsContent value="contract" className="mt-4">
          <ContractEditor
            code={contractCode}
            onChange={setContractCode}
            language="rust"
          />
        </TabsContent>

        <TabsContent value="cargo" className="mt-4">
          <ContractEditor
            code={cargoToml}
            onChange={setCargoToml}
            language="toml"
          />
        </TabsContent>

        <TabsContent value="schema" className="mt-4">
          <SchemaEditor schema={uiSchema} onChange={setUiSchema} />
        </TabsContent>
      </Tabs>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(app.id)}
          className="text-destructive-foreground hover:text-destructive-foreground"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegenerate(app.description || app.name)}
            disabled={regenerating}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {regenerating ? "Generating..." : "Regenerate"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            onClick={() => onDeploy(app.id)}
            disabled={deploying || app.status === "deploying"}
          >
            <Rocket className="mr-2 h-4 w-4" />
            {deploying || app.status === "deploying"
              ? "Deploying..."
              : "Deploy to Arbitrum"}
          </Button>
        </div>
      </div>
    </div>
  );
}
