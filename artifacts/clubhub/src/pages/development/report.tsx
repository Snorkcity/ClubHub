import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, TrendingUp, Award, Target, Info, CalendarDays } from "lucide-react";

import { useGetDevelopmentReport, getGetDevelopmentReportQueryKey } from "@workspace/api-client-react";
import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

function ScoreBadge({ score }: { score: number }) {
  if (score >= 5) return <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">5 - Exceptional</Badge>;
  if (score >= 4) return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">4 - Above Standard</Badge>;
  if (score >= 3) return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">3 - Meets Standard</Badge>;
  if (score >= 2) return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">2 - Developing</Badge>;
  return <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">1 - Needs Development</Badge>;
}

export default function DevelopmentReport() {
  const params = useParams();
  const reportId = Number(params.reportId);

  const { data: report, isLoading, error, refetch } = useGetDevelopmentReport(reportId, {
    query: { queryKey: getGetDevelopmentReportQueryKey(reportId) }
  });

  if (isLoading) return <LoadingScreen message="Loading report..." />;
  if (error || !report) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10 print:bg-white print:overflow-visible">
      {/* Non-printable header */}
      <div className="container mx-auto p-4 md:p-8 max-w-4xl print:hidden">
        <Link
          href={`/people/${report.player.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Profile
        </Link>
      </div>

      <div className="container mx-auto px-4 md:px-8 pb-12 max-w-4xl print:p-0">
        <div className="bg-card border rounded-3xl overflow-hidden shadow-sm print:shadow-none print:border-none print:rounded-none">
          {/* Report Header */}
          <div className="bg-primary/5 p-6 md:p-10 border-b relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 text-primary/10">
              <TrendingUp className="w-64 h-64" />
            </div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
              <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-background shadow-md bg-background shrink-0">
                <AvatarFallback className="text-3xl font-display font-bold text-primary bg-primary/10">
                  {report.player.firstName.charAt(0)}{report.player.lastName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-3">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {report.reportingPeriod}
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground mb-1">
                  {report.player.fullName}
                </h1>
                <p className="text-muted-foreground font-medium flex items-center gap-2">
                  Player Development Report
                  <span className="opacity-50">•</span>
                  Released {format(new Date(report.releasedAt), "MMMM d, yyyy")}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-10 space-y-12">
            
            {/* Written Feedback */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-green-50/50 border-green-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-green-800">
                  <Award className="h-6 w-6" />
                  <h3 className="font-display font-bold text-lg">Key Strength</h3>
                </div>
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {report.strength}
                </p>
              </Card>

              <Card className="p-6 bg-amber-50/50 border-amber-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-amber-800">
                  <Target className="h-6 w-6" />
                  <h3 className="font-display font-bold text-lg">Focus Area</h3>
                </div>
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {report.focus}
                </p>
              </Card>
            </div>

            {/* Assessment Categories */}
            <div>
              <h3 className="font-display font-bold text-2xl mb-6 flex items-center gap-3 border-b pb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
                Assessment Ratings
              </h3>
              
              <div className="grid gap-3">
                {report.categories.map((cat, i) => (
                  <div key={cat.key} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl ${i % 2 === 0 ? "bg-muted/30" : ""}`}>
                    <div className="flex-1">
                      <h4 className="font-bold text-base text-foreground mb-0.5">{cat.label}</h4>
                      <p className="text-sm text-muted-foreground leading-snug">{cat.narrative}</p>
                    </div>
                    <div className="shrink-0">
                      <ScoreBadge score={cat.score} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclosure/Footer */}
            <div className="pt-6 border-t mt-12 flex items-start gap-3 text-muted-foreground">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed max-w-3xl">
                {report.disclosure}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
