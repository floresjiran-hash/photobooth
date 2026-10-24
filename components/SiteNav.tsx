"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera } from "lucide-react";

/** Top bar for the public pages. The booth, editor and owner screens keep their own full-screen layouts. */
export default function SiteNav() {
  const path = usePathname();
  if (!(path === "/" || path.startsWith("/gallery"))) return null;
  const tab = (href: string, label: string) => (
    <Link href={href} className={`rounded-full px-4 py-2 text-sm font-bold transition ${path.startsWith(href) ? "bg-ink text-paper" : "hover:bg-ink/10"}`}>{label}</Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-tomato text-white shadow-sm"><Camera size={18} /></span>
          <span className="font-display text-xl font-black tracking-tight">Photo Booth</span>
        </Link>
        <nav className="flex items-center gap-1">
          {tab("/gallery", "Gallery")}
          <Link href="/admin" className="ml-1 rounded-full border-2 border-ink bg-sodium px-4 py-2 text-sm font-bold shadow-sm transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">Booth</Link>
        </nav>
      </div>
    </header>
  );
}
