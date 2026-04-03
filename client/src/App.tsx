import { useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { AppView } from "@/components/AppView";
import { useApps } from "@/hooks/useApps";
import { useGenerate } from "@/hooks/useGenerate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { App as AppType } from "@/types/schema";

function App() {
  const {
    apps,
    selectedApp,
    selectedId,
    loading: appsLoading,
    walletAddress,
    selectApp,
    createApp,
    updateApp,
    deleteApp,
    deployApp,
  } = useApps();

  const { generate, loading: generating } = useGenerate();

  const [searchQuery, setSearchQuery] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [deploying, setDeploying] = useState(false);

  const handleNewApp = async () => {
    if (!newDescription.trim()) return;

    const result = await generate(newDescription);
    if (!result) {
      toast.error("Generation failed");
      return;
    }

    try {
      const app = await createApp({
        name: result.uiSchema.title || "Untitled App",
        description: result.uiSchema.description || newDescription,
        contractCode: result.contractCode,
        cargoToml: result.cargoToml,
        uiSchema: result.uiSchema,
      });
      toast.success(`Created "${app.name}"`);
      setShowNewDialog(false);
      setNewDescription("");
    } catch {
      toast.error("Failed to save app");
    }
  };

  const handleSave = async (id: string, data: Partial<AppType>) => {
    try {
      await updateApp(id, data);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleRegenerate = async (description: string) => {
    if (!selectedApp) return;
    const result = await generate(description);
    if (!result) {
      toast.error("Regeneration failed");
      return;
    }
    await updateApp(selectedApp.id, {
      contractCode: result.contractCode,
      cargoToml: result.cargoToml,
      uiSchema: result.uiSchema,
    });
    toast.success("Regenerated");
  };

  const handleDeploy = async (id: string) => {
    setDeploying(true);
    try {
      const app = await deployApp(id);
      if (app.status === "deployed") {
        toast.success(`Deployed to ${app.deployedAddress}`);
      } else {
        toast.error(app.error || "Deployment failed");
      }
    } catch {
      toast.error("Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async (id: string) => {
    const app = apps.find((a) => a.id === id);
    try {
      await deleteApp(id);
      toast.success(`Deleted "${app?.name}"`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header walletAddress={walletAddress} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          apps={apps}
          selectedId={selectedId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={selectApp}
          onNewApp={() => setShowNewDialog(true)}
        />

        <main className="flex-1 overflow-auto p-6">
          {appsLoading ? (
            <div className="max-w-5xl mx-auto space-y-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-6 w-96" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : selectedApp ? (
            <AppView
              app={selectedApp}
              onSave={handleSave}
              onRegenerate={handleRegenerate}
              onDeploy={handleDeploy}
              onDelete={handleDelete}
              deploying={deploying}
              regenerating={generating}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">
                  Build Arbitrum Stylus dApps with AI
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Describe your app and ArbiBench generates the Rust smart
                  contract and dynamic UI. Edit, preview, and deploy.
                </p>
                <Button onClick={() => setShowNewDialog(true)} size="lg">
                  Create Your First App
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New App Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New App</DialogTitle>
            <DialogDescription>
              Describe your Arbitrum dApp and we'll generate the Stylus smart
              contract and UI.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. A tip jar where users can send ETH tips with messages, and the owner can withdraw..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={5}
            className="resize-none"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewDialog(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleNewApp}
              disabled={!newDescription.trim() || generating}
            >
              {generating ? "Generating..." : "Generate App"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors />
    </div>
  );
}

export default App;
