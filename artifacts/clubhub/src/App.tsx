import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
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
import Schedule from "@/pages/schedule";
import Messages from "@/pages/messages/index";
import PeopleList from "@/pages/people/index";
import PersonDetail from "@/pages/people/detail";
import Settings from "@/pages/settings";
import Shell from "@/components/layout/shell";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
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
    colorPrimary: "hsl(142, 76%, 36%)",
    colorForeground: "hsl(222, 47%, 11%)",
    colorMutedForeground: "hsl(215, 16%, 47%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(214, 32%, 91%)",
    colorInputForeground: "hsl(222, 47%, 11%)",
    colorNeutral: "hsl(214, 32%, 91%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    footerActionLink: "text-green-600 font-bold hover:text-green-700",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400 font-medium",
    identityPreviewEditButton: "text-green-600 hover:text-green-700",
    formFieldSuccessText: "text-green-600",
    alertText: "text-red-600",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-colors",
    formButtonPrimary: "bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-[0.98]",
    formFieldInput: "rounded-xl border-gray-200 dark:border-zinc-800 focus:border-green-600 focus:ring-green-600/20 bg-gray-50/50 dark:bg-zinc-900/50",
    footerAction: "mt-6 text-center text-sm",
    dividerLine: "bg-gray-200 dark:bg-zinc-800",
    alert: "bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-xl p-3",
    otpCodeFieldInput: "border-gray-200 dark:border-zinc-800 rounded-xl focus:border-green-600 focus:ring-green-600/20",
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

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {() => (
        <>
          <Show when="signed-in">
            <Shell>
              <Component />
            </Shell>
          </Show>
          <Show when="signed-out">
            <Redirect to="/sign-in" />
          </Show>
        </>
      )}
    </Route>
  );
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
            title: "Join ClubHub",
            subtitle: "Get started with your club",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <ProtectedRoute path="/home" component={Home} />
          <ProtectedRoute path="/teams" component={TeamsList} />
          <ProtectedRoute path="/teams/:teamId" component={TeamDetail} />
          <ProtectedRoute path="/teams/:teamId/monitoring" component={TeamMonitoring} />
          <ProtectedRoute path="/checkin" component={Checkin} />
          <ProtectedRoute path="/events/:eventId" component={EventDetail} />
          <ProtectedRoute path="/schedule" component={Schedule} />
          <ProtectedRoute path="/messages" component={Messages} />
          <ProtectedRoute path="/people" component={PeopleList} />
          <ProtectedRoute path="/people/:personId" component={PersonDetail} />
          <ProtectedRoute path="/settings" component={Settings} />
          
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
