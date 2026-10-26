import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { NahreoBrand } from "@/components/brand/nahreo-logo";

export const LEGAL_CONTACT = "scott.conlon10@gmail.com";

export function LegalContact() {
  return <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>;
}

export function LegalLayout({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Nahreo`;
    const values = [
      ["name", "description", description],
      ["property", "og:title", `${title} | Nahreo`],
      ["property", "og:description", description],
    ];
    const restore = values.map(([attribute, key, content]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const meta = existing || document.createElement("meta");
      const previous = meta.getAttribute("content");
      if (!existing) {
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
      return () => {
        if (!existing) meta.remove();
        else if (previous === null) meta.removeAttribute("content");
        else meta.setAttribute("content", previous);
      };
    });
    return () => {
      document.title = previousTitle;
      restore.forEach((reset) => reset());
    };
  }, [title, description]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label="Nahreo home"><NahreoBrand wordmarkClassName="text-xl" /></Link>
          <Link href="/" className="inline-flex min-h-12 items-center rounded-lg px-3 font-semibold text-primary underline-offset-4 hover:underline">Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Nahreo</p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Effective 26 October 2026</p>
        <aside className="my-7 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-foreground">
          These pages explain Nahreo&apos;s service and practices. They provide general information, not legal or medical advice.
        </aside>
        <article className="space-y-5 leading-7 [overflow-wrap:anywhere] [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-xl [&_h2]:font-bold [&_li]:my-2 [&_ul]:list-disc [&_ul]:pl-6">
          <p>Nahreo is operated by <strong>Scott Douglas Conlon</strong>, an individual based in the <strong>Australian Capital Territory, Australia</strong>. Contact: <LegalContact />.</p>
          {children}
        </article>
      </main>
      <footer className="border-t">
        <nav aria-label="Legal and contact" className="mx-auto flex max-w-3xl flex-wrap gap-x-6 px-5 py-5 text-sm">
          <Link href="/privacy" className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-4 hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-4 hover:underline">Terms of Use</Link>
          <a href={`mailto:${LEGAL_CONTACT}`} className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-4 hover:underline">Contact</a>
        </nav>
      </footer>
    </div>
  );
}
