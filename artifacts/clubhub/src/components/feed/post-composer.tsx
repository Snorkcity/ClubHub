import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListTeams,
  useCreatePost,
  getGetMeQueryKey,
  getListTeamsQueryKey,
  getGetFeedQueryKey,
  getGetClubOverviewQueryKey,
  getListTeamPostsQueryKey,
} from "@workspace/api-client-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

/**
 * Heja-style post composer. Renders a "Share something with the team…" card
 * (desktop/inline) or a floating write button (mobile) that opens the same
 * compose dialog. Only visible to users who can post (team staff/club admin).
 */
export function PostComposer({ variant }: { variant: "card" | "fab" }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isClubAdmin = !!me?.isClubAdmin;
  const { data: allTeams } = useListTeams({
    query: { queryKey: getListTeamsQueryKey(), enabled: isClubAdmin },
  });

  const postableTeams = useMemo(() => {
    if (isClubAdmin)
      return (allTeams ?? []).map((t) => ({ id: t.id, name: t.name }));
    return (me?.memberships ?? [])
      .filter((m) => m.role === "coach" || m.role === "manager")
      .map((m) => ({ id: m.teamId, name: m.teamName }));
  }, [isClubAdmin, allTeams, me]);

  const [open, setOpen] = useState(false);

  if (!me || postableTeams.length === 0) return null;

  const trigger =
    variant === "card" ? (
      <Card className="p-4 rounded-2xl cursor-pointer hover:shadow-md transition-all hidden md:flex items-center gap-3">
        <Avatar className="h-10 w-10 border shadow-sm">
          <AvatarImage src={me.person.avatarUrl ?? undefined} />
          <AvatarFallback>{me.person.firstName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-muted-foreground text-sm flex-1">
          Share something with the team…
        </span>
        <Button size="sm" className="rounded-full pointer-events-none" tabIndex={-1}>
          Post
        </Button>
      </Card>
    ) : (
      <Button
        size="icon"
        aria-label="Write post"
        className="md:hidden fixed right-4 z-40 h-14 w-14 rounded-full shadow-lg bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      >
        <Pencil className="h-6 w-6" />
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
        </DialogHeader>
        <ComposeForm teams={postableTeams} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ComposeForm({
  teams,
  onDone,
}: {
  teams: { id: number; name: string }[];
  onDone: () => void;
}) {
  const [teamId, setTeamId] = useState<string>(
    teams.length === 1 ? String(teams[0].id) : "",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createPost = useCreatePost({
    mutation: {
      onSuccess: (_post, vars) => {
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClubOverviewQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getListTeamPostsQueryKey(vars.teamId),
        });
        toast({ title: "Posted", description: "Your update is live on the team feed." });
        onDone();
      },
      onError: () => {
        toast({
          title: "Couldn't post",
          description: "Something went wrong — please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const canSubmit = body.trim().length > 0 && teamId !== "" && !createPost.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        createPost.mutate({
          teamId: Number(teamId),
          data: {
            body: body.trim(),
            ...(title.trim() ? { title: title.trim() } : {}),
            pinned,
          },
        });
      }}
    >
      {teams.length > 1 ? (
        <div className="space-y-2">
          <Label>Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Posting to <span className="font-semibold text-foreground">{teams[0].name}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="post-title">Title (optional)</Label>
        <Input
          id="post-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Round 16 wrap-up"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-body">Message</Label>
        <Textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share something with the team…"
          rows={6}
          autoFocus={teams.length === 1}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="post-pinned" checked={pinned} onCheckedChange={setPinned} />
          <Label htmlFor="post-pinned" className="cursor-pointer">
            Pin to top
          </Label>
        </div>
        <Button type="submit" disabled={!canSubmit} className="rounded-full px-6">
          {createPost.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
