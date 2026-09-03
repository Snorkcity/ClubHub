import { useState } from "react";
import { Check, Copy, Link2, Mail, MailPlus } from "lucide-react";
import { useCreateTeamInvitation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";

export function InvitePersonDialog({ teamId }: { teamId?: number }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "coach" | "player">("player");
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "link">("email");
  const [result, setResult] = useState<{
    inviteLink: string;
    emailSent: boolean;
    warning?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const createInvite = useCreateTeamInvitation();
  const { toast } = useToast();

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("player");
    setDeliveryMethod("email");
    setResult(null);
    setCopied(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId) return;
    createInvite.mutate(
      { data: { teamId, firstName, lastName, email, role, deliveryMethod } },
      {
        onSuccess: (data) => setResult(data),
        onError: (error: any) =>
          toast({
            title: "Could not create invitation",
            description:
              error?.data?.error ??
              error?.message ??
              "Check the details and try again.",
            variant: "destructive",
          }),
      },
    );
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteLink);
    setCopied(true);
    toast({ title: "Invitation link copied" });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={!teamId}
          className="w-full sm:w-auto rounded-xl"
          title={!teamId ? "Choose a team first" : undefined}
        >
          <MailPlus className="mr-2 h-4 w-4" />
          Invite someone
        </Button>
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                Invitation created
              </DialogTitle>
              <DialogDescription>
                {result.emailSent
                  ? `We emailed ${email}. You can also share this secure link by text.`
                  : result.warning ??
                    "No email was sent. Copy this secure link and share it with the invited person."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="invite-link">Secure invitation link</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={result.inviteLink}
                  className="min-w-0"
                />
                <Button type="button" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="sr-only">Copy invitation link</span>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                The link expires in seven days and must be opened by the invited
                email address.
              </p>
            </div>
            <Button onClick={() => setOpen(false)} className="rounded-xl">
              Done
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                Invite someone
              </DialogTitle>
              <DialogDescription>
                Add them to this team and send a secure Nahreo invitation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">First name</Label>
                <Input
                  id="invite-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last-name">Last name</Label>
                <Input
                  id="invite-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>How would you like to send it?</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={deliveryMethod === "email" ? "default" : "outline"}
                  onClick={() => setDeliveryMethod("email")}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3 text-left"
                >
                  <Mail className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Send by email</span>
                    <span className="block text-xs font-normal opacity-80">Nahreo sends it</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={deliveryMethod === "link" ? "default" : "outline"}
                  onClick={() => setDeliveryMethod("link")}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3 text-left"
                >
                  <Link2 className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Create link only</span>
                    <span className="block text-xs font-normal opacity-80">You share it</span>
                  </span>
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {deliveryMethod === "link" && (
                <p className="text-xs text-muted-foreground">
                  Used to make sure only the intended person can claim this invitation.
                  Nahreo won&apos;t email them.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Team role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="player">Player</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={createInvite.isPending}
              className="w-full rounded-xl"
            >
              {createInvite.isPending
                ? deliveryMethod === "email"
                  ? "Sending invitation…"
                  : "Creating link…"
                : deliveryMethod === "email"
                  ? "Send invitation"
                  : "Create invitation link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}