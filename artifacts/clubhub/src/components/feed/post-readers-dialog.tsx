import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { useListPostReaders, getListPostReadersQueryKey } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function PostReadersDialog({ postId, readCount, readerCount }: {
  postId: number;
  readCount: number;
  readerCount: number;
}) {
  const [open, setOpen] = useState(false);
  const readers = useListPostReaders(postId, {
    query: {
      queryKey: getListPostReadersQueryKey(postId),
      enabled: open,
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: open ? 30_000 : false,
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="mt-1 flex justify-end pr-16 md:pr-0">
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${readCount} of ${readerCount} read. See who has read this post`}
          >
            <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{readCount}/{readerCount} read</span>
          </button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader>
          <DialogTitle>Read by</DialogTitle>
          <DialogDescription>
            People who have viewed this post. This doesn’t confirm they read the full message.
          </DialogDescription>
        </DialogHeader>
        {readers.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Loading readers…</p>
        ) : readers.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-muted-foreground">Couldn’t load the readers.</p>
            <Button size="sm" variant="outline" disabled={readers.isFetching} onClick={() => void readers.refetch()}>
              Try again
            </Button>
          </div>
        ) : readers.data?.length ? (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">{readers.data.length} {readers.data.length === 1 ? "person" : "people"}</p>
            <ul className="max-h-[50dvh] divide-y overflow-y-auto">
              {readers.data.map(person => (
                <li key={person.id} className="py-2 text-sm break-words">{person.fullName}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded readers yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
