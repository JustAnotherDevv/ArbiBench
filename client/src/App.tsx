import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { CodePanel } from "@/components/CodePanel";
import { ExplorePage } from "@/components/ExplorePage";
import { DynamicRenderer } from "@/components/DynamicRenderer";
import { useAuth } from "@/hooks/useAuth";
import { useApps } from "@/hooks/useApps";
import { useChat, type CodeState } from "@/hooks/useChat";
import { WalletProvider } from "@/contexts/WalletContext";
import { hasBurnerKey } from "@/lib/burnerWallet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Flame, Wallet, MessageSquare, Code2, Compass, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { App as AppType } from "@/types/schema";


function App() {
  const auth = useAuth();
  const {
    apps,
    selectedApp,
    selectedId,
    selectApp,
    updateApp,
    deleteApp,
    deployApp,
    publishApp,
    unpublishApp,
    refreshApps,
  } = useApps(auth.address);

  const chat = useChat(auth.address);

  const [searchQuery, setSearchQuery] = useState("");
  const [, setDeploying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appMode, setAppMode] = useState<"build" | "explore">("build");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "code">("chat");

  // App selected from the Explore page (not owned by user, read-only)
  const [exploreApp, setExploreApp] = useState<AppType | null>(null);

  // Published app opened in the explore modal
  const [modalApp, setModalApp] = useState<AppType | null>(null);

  // Local editable code state for the CodePanel (may differ from saved app)
  const [editCode, setEditCode] = useState<CodeState | null>(null);

  // Mirror of chat.items that's always current (avoids stale closure in effects)
  const currentItemsRef = useRef(chat.items);
  useEffect(() => { currentItemsRef.current = chat.items; }, [chat.items]);

  // Persist chat items to localStorage whenever they change
  useEffect(() => {
    if (!selectedId || chat.items.length === 0) return;
    try {
      localStorage.setItem(`chat:${selectedId}`, JSON.stringify(chat.items));
    } catch { /* ignore quota errors */ }
  }, [selectedId, chat.items]);

  // Track previous selectedId so we know which app to save history for
  const prevSelectedIdRef = useRef<string | null>(null);
  // Set when agent creates/selects an app — skip the normal reset logic once
  const agentCreatedIdRef = useRef<string | null>(null);

  // When user switches apps: save outgoing history, restore (from localStorage) or reset
  useEffect(() => {
    const incoming = selectedId;
    const outgoing = prevSelectedIdRef.current;

    // Agent-triggered switch: don't reset, just sync editCode
    if (incoming && incoming === agentCreatedIdRef.current) {
      agentCreatedIdRef.current = null;
      prevSelectedIdRef.current = incoming;
      if (selectedApp && !editCode) {
        setEditCode({
          contractCode: selectedApp.contractCode, cargoToml: selectedApp.cargoToml, uiSchema: selectedApp.uiSchema, abi: selectedApp.abi ?? [],
        });
      }
      return;
    }

    // Save current chat to localStorage for the outgoing app before switching
    if (outgoing && currentItemsRef.current.length > 0) {
      try {
        localStorage.setItem(`chat:${outgoing}`, JSON.stringify(currentItemsRef.current));
      } catch { /* ignore */ }
    }
    prevSelectedIdRef.current = incoming;

    // Load saved history from localStorage for the incoming app
    let saved: import("@/types/schema").ChatItem[] = [];
    if (incoming) {
      try {
        const raw = localStorage.getItem(`chat:${incoming}`);
        if (raw) saved = JSON.parse(raw);
      } catch { /* ignore */ }
    }

    if (saved.length > 0) {
      chat.restoreItems(saved);
      if (selectedApp) {
        setEditCode({
          contractCode: selectedApp.contractCode, cargoToml: selectedApp.cargoToml, uiSchema: selectedApp.uiSchema, abi: selectedApp.abi ?? [],
        });
      }
    } else {
      chat.reset(selectedApp ?? undefined);
      setEditCode(selectedApp ? {
        contractCode: selectedApp.contractCode, cargoToml: selectedApp.cargoToml, uiSchema: selectedApp.uiSchema, abi: selectedApp.abi ?? [],
      } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // When the agent updates code (via SSE), mirror it to editCode
  useEffect(() => {
    if (chat.currentCode) {
      setEditCode(chat.currentCode);
    }
  }, [chat.currentCode]);

  // When agent saves an app, refresh the list and select it (without resetting chat)
  useEffect(() => {
    if (chat.currentApp) {
      agentCreatedIdRef.current = chat.currentApp.id;
      refreshApps().then(() => {
        selectApp(chat.currentApp!.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.currentApp?.id]);

  const lastUserMessageRef = useRef<string>("");

  const handleSend = async (message: string) => {
    lastUserMessageRef.current = message;
    const appId = selectedId;
    const savedApp = await chat.sendMessage(
      message,
      appId,
      editCode ?? undefined,
    );
    if (savedApp) {
      await refreshApps();
      selectApp(savedApp.id);
    }
  };

  const handleRetry = () => {
    const last = lastUserMessageRef.current;
    if (!last || chat.isStreaming) return;
    // Remove the last error item and the failed run's items, then resend
    chat.trimToLastUser();
    void handleSend(last);
  };

  const handleDeploy = async () => {
    if (!selectedId) return;
    // Save current edits first
    if (editCode && selectedApp) {
      try {
        await updateApp(selectedId, {
          contractCode: editCode.contractCode,
          cargoToml: editCode.cargoToml,
          uiSchema: editCode.uiSchema,
        });
      } catch {
        // ignore save errors, proceed with deploy
      }
    }

    // Add a deploy section to the chat
    let sectionIndex = -1;
    chat.setItems((prev) => {
      sectionIndex = prev.length;
      return [...prev, { kind: "deploy_section", logs: [], status: "running" }];
    });

    setDeploying(true);
    try {
      await deployApp(
        selectedId,
        (line) => {
          chat.setItems((prev) => {
            const updated = [...prev];
            const section = updated[sectionIndex];
            if (section?.kind === "deploy_section") {
              updated[sectionIndex] = { ...section, logs: [...section.logs, line] };
            }
            return updated;
          });
        },
        (app, success, error) => {
          chat.setItems((prev) => {
            const updated = [...prev];
            const section = updated[sectionIndex];
            if (section?.kind === "deploy_section") {
              updated[sectionIndex] = {
                ...section,
                status: success ? "success" : "error",
                app,
                error,
              };
            }
            return updated;
          });
          if (success) {
            // Immediately update currentApp so CodePanel reflects deployed address without refresh
            chat.setCurrentApp(app);
            toast.success(`Deployed to ${app.deployedAddress}`);
          } else {
            toast.error(error || "Deployment failed");
          }
        },
      );
      await refreshApps();
    } catch (err) {
      chat.setItems((prev) => {
        const updated = [...prev];
        const section = updated[sectionIndex];
        if (section?.kind === "deploy_section") {
          updated[sectionIndex] = {
            ...section,
            status: "error",
            error: err instanceof Error ? err.message : "Deployment failed",
          };
        }
        return updated;
      });
      toast.error(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId || !editCode) return;
    setSaving(true);
    try {
      await updateApp(selectedId, {
        contractCode: editCode.contractCode,
        cargoToml: editCode.cargoToml,
        uiSchema: editCode.uiSchema,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (patch: Partial<import("@/types/schema").App>) => {
    if (!selectedId) return;
    await updateApp(selectedId, patch);
    await refreshApps();
    toast.success("Settings saved");
  };

  const handleDelete = async (id: string) => {
    const app = apps.find((a) => a.id === id);
    try {
      await deleteApp(id);
      localStorage.removeItem(`chat:${id}`);
      toast.success(`Deleted "${app?.name}"`);
      chat.reset();
      setEditCode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleSelectPublic = (app: AppType) => {
    setModalApp(app);
  };

  const handlePublish = async () => {
    if (!selectedId) return;
    try {
      await publishApp(selectedId);
      toast.success("App published to Explore");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    }
  };

  const handleUnpublish = async () => {
    if (!selectedId) return;
    try {
      await unpublishApp(selectedId);
      toast.success("App unpublished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unpublish");
    }
  };

  // When user selects an owned app, clear explore mode
  const handleSelectOwned = (id: string | null) => {
    setExploreApp(null);
    selectApp(id);
  };

  // The active app for display: owned selection > explore selection
  const activeApp = chat.currentApp ?? selectedApp ?? exploreApp;

  const isOwner =
    auth.address?.toLowerCase() === activeApp?.owner?.toLowerCase();

  const dirty =
    !!editCode &&
    !!selectedApp &&
    (editCode.contractCode !== selectedApp.contractCode ||
      editCode.cargoToml !== selectedApp.cargoToml ||
      JSON.stringify(editCode.uiSchema) !== JSON.stringify(selectedApp.uiSchema));

  const hasCode = !!(editCode?.contractCode);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header
        walletAddress={auth.address}
        isBurner={auth.isBurner}
        onSignIn={auth.signIn}
        onSignInBurner={auth.signInWithBurner}
        onSignOut={auth.signOut}
        authLoading={auth.loading}
      />

      {!auth.isAuthenticated ? (
        <main className="flex-1 flex items-center justify-center bg-gradient-to-b from-background to-card/20">
          <div className="text-center space-y-6 max-w-sm px-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                Build Stylus dApps with AI
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Describe your contract in plain English. ArbiBench generates
                the Rust code, compiles it, and builds the UI.
              </p>
            </div>
            <div className="space-y-3">
              <Button size="lg" onClick={auth.signIn} disabled={auth.loading} className="w-full gap-2">
                <Wallet className="h-4 w-4" />
                {auth.loading ? "Connecting…" : "Connect Wallet"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={auth.signInWithBurner}
                disabled={auth.loading}
                className="w-full gap-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
              >
                <Flame className="h-4 w-4" />
                {auth.loading ? "Connecting…" : hasBurnerKey() ? "Reconnect Burner Wallet" : "Use Burner Wallet"}
              </Button>
              <p className="text-xs text-muted-foreground/60">
                Burner wallet is local — no extension needed. Deploys to Arbitrum Sepolia.
              </p>
            </div>
            {auth.error && (
              <p className="text-sm text-destructive">{auth.error}</p>
            )}
          </div>
        </main>
      ) : (
        <WalletProvider isBurner={auth.isBurner}>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar — hidden on mobile */}
            <Sidebar
              activeMode={appMode}
              onModeChange={setAppMode}
              apps={apps}
              selectedId={selectedId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelect={handleSelectOwned}
              onDelete={handleDelete}
              onNewApp={() => {
                if (selectedId && currentItemsRef.current.length > 0) {
                  try {
                    localStorage.setItem(`chat:${selectedId}`, JSON.stringify(currentItemsRef.current));
                  } catch { /* ignore */ }
                }
                handleSelectOwned(null);
              }}
            />

            {appMode === "explore" ? (
              /* ── Full explore page ── */
              <div className="flex-1 min-w-0 overflow-hidden relative">
                <ExplorePage onSelectApp={handleSelectPublic} />

                {/* Published app modal */}
                {modalApp && (
                  <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
                    {/* Modal header */}
                    <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-background/80">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold truncate">{modalApp.name}</h2>
                        {modalApp.description && (
                          <p className="text-xs text-muted-foreground/60 truncate">{modalApp.description}</p>
                        )}
                      </div>
                      {modalApp.deployedAddress && (
                        <span className="font-mono text-[10px] text-muted-foreground/40 hidden sm:block shrink-0">
                          {modalApp.deployedAddress.slice(0, 10)}…{modalApp.deployedAddress.slice(-6)}
                        </span>
                      )}
                      <button
                        onClick={() => setModalApp(null)}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Modal content */}
                    <div className="flex-1 overflow-y-auto p-6">
                      <DynamicRenderer
                        schema={modalApp.uiSchema}
                        contractAddress={modalApp.deployedAddress}
                        abi={modalApp.abi ?? []}
                        contractCode={modalApp.contractCode}
                        walletAddress={auth.address}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Build mode: chat + code panels ── */
              <>
                {/* Chat panel */}
                <div className={cn(
                  "flex-col overflow-hidden border-r border-white/[0.06]",
                  "md:flex md:w-[340px] md:shrink-0 md:flex-none",
                  mobilePanel === "chat" ? "flex flex-1" : "hidden",
                )}>
                  <ChatPanel
                    items={chat.items}
                    isStreaming={chat.isStreaming}
                    onSend={handleSend}
                    onRetry={handleRetry}
                    onDeploy={selectedApp && isOwner ? handleDeploy : undefined}
                    currentApp={activeApp}
                    hasCode={hasCode}
                  />
                </div>

                {/* Code panel */}
                <div className={cn(
                  "overflow-hidden",
                  "md:flex md:flex-col md:flex-1",
                  mobilePanel === "code" ? "flex flex-col flex-1" : "hidden",
                )}>
                  {editCode && activeApp ? (
                    <CodePanel
                      app={activeApp}
                      contractCode={editCode.contractCode}
                      cargoToml={editCode.cargoToml}
                      uiSchema={editCode.uiSchema}
                      abi={editCode.abi ?? activeApp.abi ?? []}
                      onContractCodeChange={(v) =>
                        setEditCode((prev) => prev ? { ...prev, contractCode: v } : prev)
                      }
                      onCargoTomlChange={(v) =>
                        setEditCode((prev) => prev ? { ...prev, cargoToml: v } : prev)
                      }
                      onUiSchemaChange={(v) =>
                        setEditCode((prev) => prev ? { ...prev, uiSchema: v } : prev)
                      }
                      onSave={handleSave}
                      onSaveSettings={handleSaveSettings}
                      onVersionRestored={async () => { await refreshApps(); }}
                      onPublish={isOwner ? handlePublish : undefined}
                      onUnpublish={isOwner ? handleUnpublish : undefined}
                      isOwner={isOwner}
                      saving={saving}
                      dirty={dirty}
                      walletAddress={auth.address}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-card/10">
                      <div className="text-center space-y-3 max-w-xs px-6">
                        <div className="mx-auto h-12 w-12 rounded-2xl border border-white/[0.06] flex items-center justify-center">
                          <Code2 className="h-5 w-5 text-muted-foreground/20" />
                        </div>
                        <p className="text-sm font-light text-muted-foreground/50">
                          Code appears here
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground/25 leading-relaxed">
                          Describe a dApp in the chat and the contract, UI, and preview will show here.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Mobile bottom nav ── */}
          <nav className="md:hidden shrink-0 h-14 border-t border-white/[0.06] bg-background/95 backdrop-blur flex items-stretch">
            <MobileNavTab
              icon={<MessageSquare className="h-4 w-4" />}
              label="Chat"
              active={appMode === "build" && mobilePanel === "chat"}
              onClick={() => { setAppMode("build"); setMobilePanel("chat"); }}
            />
            <MobileNavTab
              icon={<Code2 className="h-4 w-4" />}
              label="Code"
              active={appMode === "build" && mobilePanel === "code"}
              onClick={() => { setAppMode("build"); setMobilePanel("code"); }}
            />
            <MobileNavTab
              icon={<Compass className="h-4 w-4" />}
              label="Explore"
              active={appMode === "explore"}
              onClick={() => setAppMode("explore")}
            />
          </nav>
        </div>
        </WalletProvider>
      )}

      <Toaster richColors />
    </div>
  );
}

function MobileNavTab({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
        active ? "text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground/60",
      )}
    >
      {icon}
      <span className="font-mono text-[9px] tracking-widest uppercase">{label}</span>
    </button>
  );
}

export default App;
