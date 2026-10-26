import { Link } from "wouter";
import { ArrowRight, Activity, CalendarDays, ShieldCheck, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NahreoBrand } from "@/components/brand/nahreo-logo";
import { LEGAL_CONTACT } from "@/components/legal/legal-layout";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background selection:bg-primary/20 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <NahreoBrand wordmarkClassName="text-xl" />
          <div className="flex items-center gap-4">
            <Button asChild className="rounded-full px-6 font-semibold shadow-sm">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          <div className="container relative mx-auto px-4 text-center max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              The modern OS for soccer clubs
            </div>
            <h1 className="text-5xl lg:text-7xl font-display font-black tracking-tighter mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 text-foreground balance-text">
              Run your entire club from one place.
            </h1>
            <p className="text-xl lg:text-2xl text-muted-foreground mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 balance-text max-w-2xl mx-auto">
              Replace scattered group chats and spreadsheets. Nahreo brings teams, rosters, scheduling, and communication under one roof.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
              <Button asChild size="lg" className="rounded-full px-8 h-14 text-base font-bold shadow-lg shadow-primary/20 w-full sm:w-auto">
                <Link href="/sign-in">
                  Sign In <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              New clubs are invitation-only. To set up a club or join a team, open the invitation link you received.
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-muted/30 border-y">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-4xl font-display font-bold tracking-tight mb-4">Built for everyone on the pitch</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Whether you're a club director managing 15 teams or a parent juggling three kids' schedules, Nahreo adapts to you.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: ShieldCheck, title: "Club Admins", desc: "Get a bird's-eye view of your entire organization. Create teams, assign staff, and track club health." },
                { icon: Users, title: "Coaches & Managers", desc: "Easily manage your rosters, schedule training sessions, and track player availability in real-time." },
                { icon: CalendarDays, title: "Players & Parents", desc: "One unified schedule for all your teams. RSVP to events with a single tap and stay in the loop." },
                { icon: MessageSquare, title: "Unified Communication", desc: "Team feeds and direct messaging keep conversations organized and out of text threads." },
                { icon: Activity, title: "Live Availability", desc: "Never guess who's showing up. Clear RSVP tracking means better training sessions." }
              ].map((feature, i) => (
                <div key={i} className="bg-background rounded-3xl p-8 border shadow-sm hover:shadow-md transition-shadow">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h2 className="text-4xl lg:text-5xl font-display font-bold tracking-tight mb-6">Ready to elevate your club?</h2>
            <p className="text-xl text-muted-foreground mb-10">
              Already part of Nahreo? Sign in to your club. New club and team members should use their invitation link.
            </p>
            <Button asChild size="lg" className="rounded-full px-10 h-16 text-lg font-bold shadow-xl shadow-primary/20">
              <Link href="/sign-in">
                Sign In to Nahreo
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="bg-zinc-950 text-zinc-400 py-12 text-center border-t border-zinc-900">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <NahreoBrand inverse className="text-zinc-100" markClassName="h-7 w-7" wordmarkClassName="text-base" />
          <nav aria-label="Legal and contact" className="flex flex-wrap justify-center gap-x-6 text-sm">
            <Link href="/privacy" className="inline-flex min-h-12 items-center text-zinc-200 underline-offset-4 hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="inline-flex min-h-12 items-center text-zinc-200 underline-offset-4 hover:underline">Terms of Use</Link>
            <a href={`mailto:${LEGAL_CONTACT}`} className="inline-flex min-h-12 items-center text-zinc-200 underline-offset-4 hover:underline">Contact</a>
          </nav>
          <p className="text-sm">&copy; {new Date().getFullYear()} Nahreo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
