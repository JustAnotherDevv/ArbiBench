import { Header } from "@/components/Header";
import { AppBuilder } from "@/components/AppBuilder";
import { ContractViewer } from "@/components/ContractViewer";
import { DynamicRenderer } from "@/components/DynamicRenderer";
import { useGenerate } from "@/hooks/useGenerate";
import { Skeleton } from "@/components/ui/skeleton";

function App() {
  const { generate, data, loading, error } = useGenerate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-7xl p-6">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            Build Arbitrum dApps with AI
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Describe your app idea and ArbitrumBench will generate the smart
            contract and a dynamic UI — no coding required.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-6">
            <AppBuilder onGenerate={generate} loading={loading} />

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
                {error}
              </div>
            )}

            {loading && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}

            {data && !loading && <ContractViewer contract={data.contract} />}
          </div>

          <div>
            {loading && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-96 w-full" />
              </div>
            )}

            {data && !loading && <DynamicRenderer schema={data.uiSchema} />}

            {!data && !loading && (
              <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-border">
                <p className="text-muted-foreground">
                  Generated UI will appear here
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
