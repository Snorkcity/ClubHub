import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { ActiveTeamProvider } from '@/lib/active-team';
import { ThemeProvider } from '@/lib/theme';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import Home from "@/pages/home";
import TeamsList from "@/pages/teams/index";
import TeamDetail from "@/pages/teams/detail";
import TeamMonitoring from "@/pages/teams/monitoring";
import Checkin from "@/pages/checkin";
import EventDetail from "@/pages/events/detail";
import EventTimekeeping from "@/pages/events/timekeeping";
import TeamMinutes from "@/pages/teams/minutes";
import Schedule from "@/pages/schedule";
import Messages from "@/pages/messages/index";
import ChatPage from "@/pages/messages/chat";
import PeopleList from "@/pages/people/index";
import PersonDetail from "@/pages/people/detail";
import Settings from "@/pages/settings";
import Notifications from "@/pages/notifications";
import JoinTeam from "@/pages/join";
import Shell from "@/components/layout/shell";
import GetStarted from "@/pages/get-started";
import { useGetOnboardingStatus } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

// When the API runs on a different origin (e.g. Railway), point the client at
// it via VITE_API_URL. Left unset on Replit, where /api is same-origin.
setBaseUrl(import.meta.env.VITE_API_URL ?? null);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#173F8A",
    colorForeground: "#101828",
    colorMutedForeground: "hsl(215, 16%, 47%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(214, 32%, 91%)",
    colorInputForeground: "hsl(222, 47%, 11%)",
    colorNeutral: "hsl(214, 32%, 91%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white dark:bg-zinc-950 rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-gray-100 dark:border-zinc-800",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-display font-bold text-gray-900 dark:text-gray-50 tracking-tight",
    headerSubtitle: "text-gray-500 dark:text-gray-400",
    socialButtonsBlockButtonText: "text-gray-600 dark:text-gray-300 font-medium",
    formFieldLabel: "text-gray-700 dark:text-gray-300 font-medium",
    footerActionLink: "text-primary font-bold hover:text-primary/90",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400 font-medium",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-primary",
    alertText: "text-red-600",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "!min-h-12 !py-3 border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-colors",
    formButtonPrimary: "!min-h-12 !py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-[0.98]",
    formFieldInput: "rounded-xl !bg-gray-100 dark:!bg-zinc-800/80 !border !border-gray-300 dark:!border-zinc-700 focus:!border-primary focus:!ring-primary/20",
    footerAction: "mt-6 text-center text-sm",
    dividerLine: "bg-gray-200 dark:bg-zinc-800",
    alert: "bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl p-3",
    otpCodeFieldInput: "!bg-gray-100 dark:!bg-zinc-800/80 !border !border-gray-300 dark:!border-zinc-700 !text-gray-900 dark:!text-gray-100 rounded-xl focus:!border-green-600 focus:!ring-green-600/20",
    formFieldRow: "mb-4",
    main: "flex flex-col gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4 pattern-grid-lg text-gray-200 dark:text-zinc-900/20">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4 pattern-grid-lg text-gray-200 dark:text-zinc-900/20">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

// Always send the ACTIVE Clerk user's fresh token on API requests instead of
// relying on the session cookie, which can go stale when switching accounts
// (previously caused the API to answer as the old user after a switch).
let latestGetToken: (() => Promise<string | null>) | null = null;
setAuthTokenGetter(() => (latestGetToken ? latestGetToken() : null));

function ApiAuthBinder() {
  const { getToken } = useAuth();
  latestGetToken = getToken;
  useEffect(() => {
    return () => {
      latestGetToken = null;
    };
  }, []);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/home" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRouteInner({ component: Component }: { component: any }) {
  const { data: status, isLoading, isError, refetch } =
    useGetOnboardingStatus();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center dark:bg-zinc-950">
        <p className="font-semibold">We couldn&apos;t check your account.</p>
        <button
          type="button"
          className="rounded-xl bg-primary px-5 py-3 font-semibold text-white"
          onClick={() => refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status?.needsOnboarding) {
    return <Redirect to="/get-started" />;
  }

  return (
    <Shell>
      <Component />
    </Shell>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {() => (
        <>
          <Show when="signed-in">
            <ProtectedRouteInner component={Component} />
          </Show>
          <Show when="signed-out">
            <Redirect to="/sign-in" />
          </Show>
        </>
      )}
    </Route>
  );
}

function GetStartedRoute() {
  const { data: status, isLoading, isError, refetch } =
    useGetOnboardingStatus();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center dark:bg-zinc-950">
        <p className="font-semibold">We couldn&apos;t start setup.</p>
        <button
          type="button"
          className="rounded-xl bg-primary px-5 py-3 font-semibold text-white"
          onClick={() => refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status && !status.needsOnboarding) {
    return <Redirect to="/home" />;
  }

  return <GetStarted />;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your club account",
          },
        },
        signUp: {
          start: {
            title: "Join Nahreo",
            subtitle: "Get started with your club",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiAuthBinder />
        <ClerkQueryClientCacheInvalidator />
        <ActiveTeamProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/join" component={JoinTeam} />

          <Route path="/get-started">
            {() => (
              <>
                <Show when="signed-in">
                  <GetStartedRoute />
                </Show>
                <Show when="signed-out">
                  <Redirect to="/sign-in" />
                </Show>
              </>
            )}
          </Route>

          <ProtectedRoute path="/home" component={Home} />
          <ProtectedRoute path="/teams" component={TeamsList} />
          <ProtectedRoute path="/teams/:teamId" component={TeamDetail} />
          <ProtectedRoute path="/teams/:teamId/monitoring" component={TeamMonitoring} />
          <ProtectedRoute path="/teams/:teamId/minutes" component={TeamMinutes} />
          <ProtectedRoute path="/checkin" component={Checkin} />
          <ProtectedRoute path="/events/:eventId" component={EventDetail} />
          <ProtectedRoute path="/events/:eventId/timekeeping" component={EventTimekeeping} />
          <ProtectedRoute path="/schedule" component={Schedule} />
          <ProtectedRoute path="/messages" component={Messages} />
          <ProtectedRoute path="/messages/:chatId" component={ChatPage} />
          <ProtectedRoute path="/people" component={PeopleList} />
          <ProtectedRoute path="/people/:personId" component={PersonDetail} />
          <ProtectedRoute path="/settings" component={Settings} />
          <ProtectedRoute path="/notifications" component={Notifications} />
          
          <Route component={NotFound} />
        </Switch>
        </ActiveTeamProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
