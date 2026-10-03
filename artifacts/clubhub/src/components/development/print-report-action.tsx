import { Printer } from "lucide-react";

export function PrintReportAction() {
  return (
    <button
      type="button"
      data-testid="button-print-development-report"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden"
    >
      <Printer aria-hidden="true" className="h-4 w-4" />
      Print or save as PDF
    </button>
  );
}