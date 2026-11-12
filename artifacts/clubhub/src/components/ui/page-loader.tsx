import { Component, Suspense, type ReactNode } from "react";

export function ContentPlaceholder({ label = "Loading content" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-3 md:p-6">
      <span className="sr-only">{label}</span>
      <div className="h-5 w-32 rounded bg-muted animate-pulse" />
      <div className="h-24 rounded-2xl bg-muted/60 animate-pulse" />
      <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
    </div>
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-6 text-center space-y-3">
          <p>This page couldn’t load. Check your connection and reload to try again.</p>
          <button type="button" className="min-h-11 rounded-xl border px-4 font-semibold" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PageLoader({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<ContentPlaceholder label="Opening page" />}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
