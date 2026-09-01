import { useState, useRef, useEffect } from "react";
import { Save, UserCircle, Sun, Moon, MonitorSmartphone, Palette, Bell } from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";
import {
  useGetMe, useUpdateMe, getGetMeQueryKey,
  useGetPushConfig, getGetPushConfigQueryKey,
  useSavePushSubscription, useDeletePushSubscription,
  useUpdateNotificationPreferences
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import {
  getSubscription,
  usePushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

import { LoadingScreen, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Who can see this field: Everyone / Admins only / Only me. */
function PrivacySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-semibold text-muted-foreground bg-muted/50 border rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
      aria-label="Who can see this"
    >
      <option value="everyone">Everyone</option>
      <option value="admins">Admins only</option>
      <option value="private">Only me</option>
    </select>
  );
}

/** Light / Dark / Auto theme picker — saved on this device. */
function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePref; label: string; icon: typeof Sun; hint: string }[] = [
    { value: "light", label: "Light", icon: Sun, hint: "Bright & clean" },
    { value: "dark", label: "Dark", icon: Moon, hint: "Easy on the eyes" },
    { value: "system", label: "Auto", icon: MonitorSmartphone, hint: "Match my device" },
  ];
  return (
    <Card className="p-6 md:p-8 rounded-3xl border shadow-sm">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" /> Appearance
      </h2>
      <p className="text-sm text-muted-foreground mb-5">Choose how ClubHub looks on this device.</p>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {options.map(({ value, label, icon: Icon, hint }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={`rounded-2xl border p-3 md:p-4 text-center transition-colors ${
                active
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-5 w-5 mx-auto mb-1.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-sm font-bold">{label}</div>
              <div className="text-[11px] text-muted-foreground hidden md:block">{hint}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function NotificationsCard({ me }: { me: any }) {
  const pushSupport = usePushSupport();
  const { data: pushConfig } = useGetPushConfig({ query: { queryKey: getGetPushConfigQueryKey() } });

  const saveSub = useSavePushSubscription();
  const deleteSub = useDeletePushSubscription();
  const updatePrefs = useUpdateNotificationPreferences();

  const [localEnabled, setLocalEnabled] = useState(me.pushNotificationsEnabled);
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!pushSupport.isSupported) {
      setDeviceSubscribed(false);
      return;
    }
    void getSubscription(basePath).then(
      (subscription) => setDeviceSubscribed(Boolean(subscription)),
      () => setDeviceSubscribed(false),
    );
  }, [pushSupport.isSupported]);

  const handleToggle = async (enabled: boolean) => {
    setLocalEnabled(enabled);
    setIsSubscribing(true);

    try {
      if (enabled) {
        if (!pushConfig?.enabled || !pushConfig.publicKey) {
          throw new Error("Push is not configured on the server.");
        }

        let perm = pushSupport.permission;
        if (perm === 'default') {
          perm = await Notification.requestPermission();
          pushSupport.setPermission(perm);
        }

        if (perm !== "granted") {
          throw new Error("Notification permission was not granted.");
        }

        const sub = await subscribeToPush(pushConfig.publicKey, basePath);
        if (!sub) throw new Error("This device could not create a push subscription.");
        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          throw new Error("The browser returned an incomplete push subscription.");
        }
        await saveSub.mutateAsync({
          data: {
            endpoint: json.endpoint,
            keys: {
              p256dh: json.keys.p256dh,
              auth: json.keys.auth,
            },
          },
        });
        setDeviceSubscribed(true);
      } else {
        const endpoint = await unsubscribeFromPush(basePath);
        if (endpoint) {
          await deleteSub.mutateAsync({ data: { endpoint } });
        }
        setDeviceSubscribed(false);
      }

      // Save user pref
      await updatePrefs.mutateAsync({ data: { pushNotificationsEnabled: enabled } });
      queryClient.setQueryData(getGetMeQueryKey(), (old: any) =>
        old ? { ...old, pushNotificationsEnabled: enabled } : old
      );
      toast({ title: enabled ? "Push notifications enabled" : "Push notifications disabled" });
    } catch {
      toast({
        title: enabled ? "Notifications weren't enabled" : "Notifications weren't disabled",
        description: enabled
          ? "Allow notifications when your phone asks, then try again."
          : "Please try again.",
        variant: "destructive",
      });
      setLocalEnabled(!enabled); // revert
    } finally {
      setIsSubscribing(false);
    }
  };

  const showIosWarning = pushSupport.isIos && !pushSupport.isStandalone;

  return (
    <Card className="p-6 md:p-8 rounded-3xl border shadow-sm">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" /> Notifications
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Manage how you receive updates. In-app notifications are always available from the Bell icon.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between border rounded-2xl p-4">
          <div>
            <h3 className="font-semibold">Push Notifications</h3>
            <p className="text-sm text-muted-foreground">Receive alerts on this device when you're away.</p>
          </div>
          <Switch
            checked={localEnabled}
            onCheckedChange={handleToggle}
            disabled={
              isSubscribing ||
              (!localEnabled &&
                (!pushSupport.isSupported ||
                  !pushConfig?.enabled ||
                  showIosWarning ||
                  pushSupport.permission === "denied"))
            }
          />
        </div>

        {showIosWarning && (
          <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 p-4 rounded-2xl text-sm">
            <strong>To enable push notifications on iPhone or iPad:</strong> Tap the Share button in Safari and select "Add to Home Screen". Then open the app from your home screen.
          </div>
        )}

        {!showIosWarning && (
          <p className="px-1 text-xs text-muted-foreground">
            On iPhone or iPad, first open this site in Safari and choose Share → Add to Home Screen.
          </p>
        )}

        {localEnabled &&
          deviceSubscribed === false &&
          pushConfig?.enabled &&
          pushSupport.isSupported &&
          !showIosWarning &&
          pushSupport.permission !== "denied" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleToggle(true)}
              disabled={isSubscribing}
              className="w-full rounded-xl"
            >
              Enable on this device
            </Button>
          )}

        {!pushSupport.isSupported && !pushSupport.isIos && (
          <div className="bg-muted p-4 rounded-2xl text-sm text-muted-foreground">
            Your browser does not support web push notifications.
          </div>
        )}

        {pushSupport.isSupported && pushSupport.permission === 'denied' && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-2xl text-sm">
            Push permission is blocked. Please unblock it in your browser settings to enable push notifications.
          </div>
        )}

        {!pushConfig?.enabled && (
          <div className="bg-muted p-4 rounded-2xl text-sm text-muted-foreground">
            Server push notifications are currently unavailable. In-app notifications will still work.
          </div>
        )}
      </div>
    </Card>
  );
}

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
  const [bio, setBio] = useState("");
  const [phonePrivacy, setPhonePrivacy] = useState("everyone");
  const [emailPrivacy, setEmailPrivacy] = useState("everyone");
  const [bioPrivacy, setBioPrivacy] = useState("everyone");
  const initialized = useRef(false);

  useEffect(() => {
    if (me && !initialized.current) {
      setFirstName(me.person.firstName || "");
      setLastName(me.person.lastName || "");
      setPhone(me.person.phone || "");
      setAvatarUrl(me.person.avatarUrl || "");
      setBio(me.person.bio || "");
      setPhonePrivacy(me.person.phonePrivacy || "everyone");
      setEmailPrivacy(me.person.emailPrivacy || "everyone");
      setBioPrivacy(me.person.bioPrivacy || "everyone");
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
        avatarUrl,
        bio,
        phonePrivacy: phonePrivacy as any,
        emailPrivacy: emailPrivacy as any,
        bioPrivacy: bioPrivacy as any,
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
    avatarUrl !== (me.person.avatarUrl || "") ||
    bio !== (me.person.bio || "") ||
    phonePrivacy !== (me.person.phonePrivacy || "everyone") ||
    emailPrivacy !== (me.person.emailPrivacy || "everyone") ||
    bioPrivacy !== (me.person.bioPrivacy || "everyone");

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/10">
      <div className="container mx-auto p-4 md:p-8 lg:max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your profile and account preferences.</p>
        </header>

        <div className="space-y-8">
          <AppearanceCard />

          <NotificationsCard me={me} />

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
                  No photo? Your initials<br/>are shown instead.
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="email">Email Address</Label>
                    <PrivacySelect value={emailPrivacy} onChange={setEmailPrivacy} />
                  </div>
                  <Input 
                    id="email" 
                    value={me.person.email || ""} 
                    disabled 
                    className="rounded-xl h-11 bg-muted/50 opacity-70"
                  />
                  <p className="text-[10px] text-muted-foreground">Email is managed by your authentication provider.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="phone">Phone Number</Label>
                    <PrivacySelect value={phonePrivacy} onChange={setPhonePrivacy} />
                  </div>
                  <Input 
                    id="phone" 
                    type="tel"
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="0412 345 678"
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bio">Bio</Label>
                    <PrivacySelect value={bioPrivacy} onChange={setBioPrivacy} />
                  </div>
                  <textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe yourself — position, favourite team, anything you like."
                    rows={3}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
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
