import { useState, useRef, useEffect } from "react";
import { Save, UserCircle } from "lucide-react";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";

import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function Settings() {
  const { data: me, isLoading, error, refetch } = useGetMe({ 
    query: { queryKey: getGetMeQueryKey() } 
  });
  
  const updateMe = useUpdateMe();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (me && !initialized.current) {
      setFirstName(me.person.firstName || "");
      setLastName(me.person.lastName || "");
      setPhone(me.person.phone || "");
      setAvatarUrl(me.person.avatarUrl || "");
      initialized.current = true;
    }
  }, [me]);

  if (isLoading) return <LoadingScreen message="Loading settings..." />;
  if (error || !me) return <ErrorState onRetry={() => refetch()} />;

  const handleSave = () => {
    updateMe.mutate({
      data: {
        firstName,
        lastName,
        phone,
        avatarUrl
      }
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => {
        toast({ 
          title: "Failed to update profile", 
          description: "An unexpected error occurred.",
          variant: "destructive"
        });
      }
    });
  };

  const hasChanges = 
    firstName !== me.person.firstName || 
    lastName !== me.person.lastName || 
    phone !== (me.person.phone || "") ||
    avatarUrl !== (me.person.avatarUrl || "");

  return (
    <div className="flex-1 overflow-y-auto bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your profile and account preferences.</p>
        </header>

        <div className="space-y-8">
          <Card className="p-6 md:p-8 rounded-3xl border shadow-sm">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" /> Personal Information
            </h2>
            
            <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
              <div className="flex flex-col items-center gap-3">
                <Avatar className="h-24 w-24 border shadow-sm">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
                    {firstName.charAt(0)}{lastName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="text-xs text-muted-foreground text-center">
                  Profile avatars can be updated<br/>via Clerk.
                </div>
              </div>

              <div className="flex-1 w-full space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName" 
                      value={firstName} 
                      onChange={(e) => setFirstName(e.target.value)} 
                      className="rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                      id="lastName" 
                      value={lastName} 
                      onChange={(e) => setLastName(e.target.value)} 
                      className="rounded-xl h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    value={me.person.email || ""} 
                    disabled 
                    className="rounded-xl h-11 bg-muted/50 opacity-70"
                  />
                  <p className="text-[10px] text-muted-foreground">Email is managed by your authentication provider.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    type="tel"
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="(555) 123-4567"
                    className="rounded-xl h-11"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="avatarUrl">Avatar URL</Label>
                  <Input 
                    id="avatarUrl" 
                    type="url"
                    value={avatarUrl} 
                    onChange={(e) => setAvatarUrl(e.target.value)} 
                    placeholder="https://example.com/image.jpg"
                    className="rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || updateMe.isPending}
                className="rounded-xl font-bold px-8 h-11 shadow-sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMe.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
          
          <Card className="p-6 md:p-8 rounded-3xl border shadow-sm">
            <h2 className="text-xl font-bold mb-4 text-destructive">Account Management</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Authentication settings, password resets, and account deletion are handled by your identity provider.
            </p>
            <Button variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10 rounded-xl" onClick={() => window.open(import.meta.env.BASE_URL.replace(/\/$/, "") + "/settings", "_self")}>
              Identity Provider Settings
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
