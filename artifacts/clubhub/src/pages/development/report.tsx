import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, TrendingUp, Award, Target, Info, CalendarDays } from "lucide-react";

import { useGetDevelopmentReport, getGetDevelopmentReportQueryKey } from "@workspace/api-client-react";
import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PrintReportAction } from "@/components/development/print-report-action";
import "@/components/development/print-report.css";

function ScoreBadge({ score }: { score: number }) {
  if (score >= 5) return <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">5 - Strong</Badge>;
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

  useEffect(() => {
    document.documentElement.classList.add("nahreo-report-print-active");
    document.body.classList.add("nahreo-report-print-active");
    return () => {
      document.documentElement.classList.remove("nahreo-report-print-active");
      document.body.classList.remove("nahreo-report-print-active");
    };
  }, []);

  if (isLoading) return <LoadingScreen message="Loading report..." />;
  if (error || !report) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="nahreo-report-page flex-1 overflow-y-auto bg-muted/10 print:bg-white print:overflow-visible">
      {/* Non-printable header */}
      <div className="container mx-auto p-4 md:p-8 max-w-4xl print:hidden">
        <Link
          href={`/people/${report.player.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Profile
        </Link>
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Keep a copy for your family</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Print or save a PDF copy. Saved copies can be shared outside Nahreo.
            </p>
          </div>
          <PrintReportAction />
        </div>
      </div>

      <div className="nahreo-report-content container mx-auto px-4 md:px-8 pb-12 max-w-4xl print:p-0">
        <div className="nahreo-report-card bg-card border rounded-3xl overflow-hidden shadow-sm print:shadow-none print:border-none print:rounded-none">
          <div className="nahreo-print-masthead print-keep-together items-center justify-between border-b border-[#dce3eb] px-10 py-5">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Nahreo" data-testid="img-nahreo-print-logo" className="h-9 w-9" />
              <span className="text-lg font-bold tracking-tight text-[#173f8a]">Nahreo</span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Player development · Family report
            </span>
          </div>
          {/* Report Header */}
          <div className="print-keep-together bg-primary/5 p-6 md:p-10 border-b relative overflow-hidden print:bg-[#f2f6fb] print:px-10 print:py-7">
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

          <div className="p-6 md:p-10 space-y-10">
            <div className="bg-primary/5 text-foreground/90 border border-primary/10 rounded-2xl p-5 md:p-6 leading-relaxed shadow-sm text-sm md:text-base">
              <p>This report is designed to give you a clear, constructive view of {report.player.firstName}'s progress over the last period. Our goal is to highlight what they're doing well and identify specific areas to focus on, helping them continue to grow in a positive and supportive environment.</p>
            </div>
            
            {/* Written Feedback */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="print-keep-together p-6 bg-green-50/50 border-green-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-green-800">
                  <Award className="h-6 w-6" />
                  <h3 className="font-display font-bold text-lg">Key Strength</h3>
                </div>
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {report.strength}
                </p>
              </Card>

              <Card className="print-keep-together p-6 bg-amber-50/50 border-amber-100 rounded-2xl shadow-sm">
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
                  <div key={cat.key} className={`print-keep-together flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl ${i % 2 === 0 ? "bg-muted/30" : ""}`}>
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

            {/* Coaching Team */}
            <div className="print-keep-together bg-muted/20 border p-5 md:p-6 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <div>
                <h3 className="font-display font-bold text-lg mb-1 text-foreground">Reporting Coaching Team</h3>
                <p className="text-muted-foreground text-sm font-medium">
                  {report.coachingTeam.map(c => c.fullName).join(", ")}
                </p>
              </div>
            </div>

            <div className="text-center space-y-2 mt-8 py-8 border-t border-b">
              <p className="font-medium text-foreground text-lg">Thank you for your continued support.</p>
              <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
                If you have any questions about this assessment or how to support {report.player.firstName} at home, please feel free to reach out to the coaching staff.
              </p>
            </div>

            {/* Disclosure/Footer */}
            <div className="flex items-start gap-3 text-muted-foreground">
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
