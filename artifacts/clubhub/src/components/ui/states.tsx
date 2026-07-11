import { Loader2, AlertCircle, FileQuestion } from "lucide-react";

export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[50vh] text-muted-foreground animate-in fade-in duration-500">
      <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message = "An error occurred while loading this content.", onRetry }: { title?: string, message?: string, onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[50vh] border rounded-2xl bg-destructive/5 text-destructive animate-in fade-in duration-300">
      <AlertCircle className="h-10 w-10 mb-4" />
      <h3 className="text-lg font-display font-bold">{title}</h3>
      <p className="text-sm opacity-80 max-w-sm mt-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 rounded-xl text-sm font-medium transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = "No results found", message = "There is nothing to display here yet.", icon: Icon = FileQuestion, action }: { title?: string, message?: string, icon?: React.ElementType, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-3xl bg-muted/30 animate-in fade-in duration-500">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground tracking-tight">{title}</h3>
      <p className="text-muted-foreground mt-2 max-w-sm mb-6">{message}</p>
      {action}
    </div>
  );
}
