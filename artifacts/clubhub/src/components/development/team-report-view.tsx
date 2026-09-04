import { TrendingUp, Info, Lock } from "lucide-react";
import {
  useGetDevelopmentInternalSummary,
  getGetDevelopmentInternalSummaryQueryKey,
  type DevelopmentCycleDetail,
} from "@workspace/api-client-react";

import { LoadingScreen } from "@/components/ui/states";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TeamReportView({ cycle }: { cycle: DevelopmentCycleDetail }) {
  const { data: summary, isLoading, error } = useGetDevelopmentInternalSummary(cycle.id, {
    query: {
      enabled: cycle.status !== "active",
      queryKey: getGetDevelopmentInternalSummaryQueryKey(cycle.id)
    }
  });

  if (isLoading) return <LoadingScreen message="Loading team report..." />;
  if (error || !summary) return <div className="p-8 text-center text-muted-foreground">Could not load report</div>;

  const players = [...summary.players].sort((a, b) => a.player.fullName.localeCompare(b.player.fullName));
  
  return (
    <ScrollArea className="flex-1 bg-muted/10 h-full">
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-10 pb-24">
        
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-2xl font-display font-bold">Team Overview</h2>
              <p className="text-muted-foreground">Category averages across all assessed players</p>
            </div>
            <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Cycle Average: {(Object.values(summary.teamCategoryAverages).reduce((a, b) => a + b, 0) / Object.keys(summary.teamCategoryAverages).length || 0).toFixed(1)}/5
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(summary.teamCategoryAverages).map(([key, avg]) => {
              const rubricDef = cycle.rubric.find(r => r.key === key);
              return (
                <div key={key} className="bg-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {rubricDef?.label || key}
                  </span>
                  <span className="text-3xl font-display font-bold text-foreground">
                    {avg.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-2xl font-display font-bold">Player Details</h2>
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md border flex items-center gap-2">
              <Info className="h-3.5 w-3.5" />
              Changes shown against previous completed cycle
            </div>
          </div>
          
          <div className="grid gap-6">
            {players.map(p => (
              <Card key={p.player.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-muted/30 p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border bg-card">
                      <AvatarFallback className="font-bold">{p.player.firstName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-lg leading-none mb-1">{p.player.fullName}</h3>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span className="text-foreground">Avg: {p.currentAverage.toFixed(1)}</span>
                        {p.averageChange !== null && (
                          <span className={p.averageChange > 0 ? "text-green-600" : p.averageChange < 0 ? "text-amber-600" : "text-muted-foreground"}>
                            {p.averageChange > 0 ? "+" : ""}{p.averageChange.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {p.categories.map(cat => {
                        const change = p.categoryChanges[cat.key];
                        return (
                          <div key={cat.key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                            <span className="text-sm font-medium">{cat.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{cat.score}</span>
                              {change !== null && change !== undefined && (
                                <span className={`text-[10px] font-bold px-1.5 rounded-sm ${change > 0 ? "bg-green-100 text-green-700" : change < 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                                  {change > 0 ? "+" : ""}{change}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Key Strength</h4>
                      <p className="text-sm leading-relaxed">{p.strength}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Focus Area</h4>
                      <p className="text-sm leading-relaxed">{p.focus}</p>
                    </div>
                    {p.internalNotes && (
                      <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1 flex items-center gap-1.5">
                          <Lock className="h-3 w-3" /> Internal Notes
                        </h4>
                        <p className="text-sm text-amber-900/90 leading-relaxed italic">{p.internalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}