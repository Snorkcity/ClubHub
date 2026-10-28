import { Database, AlertTriangle } from "lucide-react";
import { Redirect } from "wouter";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetClubStorage,
  getGetClubStorageQueryKey,
} from "@workspace/api-client-react";
import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PhotoStoragePage() {
  const { data: me, isLoading: meLoading, error: meError, refetch: refetchMe } = useGetMe({
    query: { queryKey: getGetMeQueryKey() },
  });
  const isAdmin = me?.isClubAdmin === true;
  const storageQuery = useGetClubStorage({
    query: {
      enabled: isAdmin,
      queryKey: getGetClubStorageQueryKey(),
      staleTime: 5 * 60 * 1000,
    },
  });

  if (meLoading) return <LoadingScreen message="Checking club access..." />;
  if (meError || !me) return <ErrorState onRetry={() => void refetchMe()} />;
  if (!isAdmin) return <Redirect to="/home" />;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10" data-testid="photo-storage-page">
      <div className="container mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <header className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Club administration</p>
          <h1 className="text-3xl font-display font-bold tracking-tight">Photo storage</h1>
          <p className="text-muted-foreground">
            Usage for photos shared in this club&apos;s posts. This is club-wide storage, not an individual team total.
          </p>
        </header>
        {storageQuery.isLoading ? (
          <div className="h-36 animate-pulse rounded-2xl border bg-card/70" aria-label="Loading photo storage" />
        ) : storageQuery.error || !storageQuery.data ? (
          <ErrorState onRetry={() => void storageQuery.refetch()} />
        ) : (
          <StorageHealth storage={storageQuery.data} />
        )}
      </div>
    </div>
  );
}

function StorageHealth({ storage }: { storage: any }) {
  const percentOfCritical = Math.min(100, (storage.postPhotos.bytes / storage.thresholds.criticalBytes) * 100);

  return (
    <section className="space-y-3" aria-labelledby="storage-health-title">
      {storage.status !== "ok" && (
        <Alert
          variant={storage.status === "critical" ? "destructive" : "default"}
          className={storage.status === "warning" ? "border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 [&>svg]:text-amber-600" : ""}
          data-testid={`status-storage-${storage.status}`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {storage.status === "critical" ? "Photo storage is critical" : "Photo storage needs attention"}
          </AlertTitle>
          <AlertDescription>{storage.plan}</AlertDescription>
        </Alert>
      )}

      <Card className="rounded-2xl p-5 shadow-sm md:p-7" data-testid="card-storage-health">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="storage-health-title" className="font-display text-lg font-bold">Club photo usage</h2>
                <p className="text-sm text-muted-foreground">
                  {storage.postPhotos.count.toLocaleString()} {storage.postPhotos.count === 1 ? "photo" : "photos"}
                </p>
              </div>
              <Badge variant={storage.status === "critical" ? "destructive" : "secondary"} data-testid="status-storage-label">
                {storage.status === "ok" ? "Healthy" : storage.status === "warning" ? "Warning" : "Critical"}
              </Badge>
            </div>
            <Progress
              value={percentOfCritical}
              className="mt-4"
              aria-label={`${formatBytes(storage.postPhotos.bytes)} of ${formatBytes(storage.thresholds.criticalBytes)} critical threshold used`}
            />
            <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
              <span data-testid="text-storage-current"><strong>{formatBytes(storage.postPhotos.bytes)}</strong> used</span>
              <span className="text-muted-foreground" data-testid="text-storage-thresholds">
                Warn at {formatBytes(storage.thresholds.warnBytes)} · Critical at {formatBytes(storage.thresholds.criticalBytes)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; value >= 1024 && i < units.length; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}
