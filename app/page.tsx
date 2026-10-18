import Link from "next/link";
import { Camera, Images, Sparkles } from "lucide-react";

const frames = ["from-sodium to-orange-400", "from-cobalt to-violet-500", "from-emerald-300 to-sky-400"];

function Strip({ className, r }: { className: string; r: string }) {
  return (
    <div className={`floaty absolute w-44 rounded-md bg-white p-3 shadow-2xl ${className}`} style={{ ["--r" as string]: r }}>
      {frames.map((f) => <div key={f} className={`mb-3 aspect-[4/3] rounded bg-gradient-to-br ${f}`} />)}
      <p className="text-center font-display text-xs font-bold tracking-widest text-ink/60">PHOTO BOOTH</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-sodium/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 size-[26rem] rounded-full bg-cobalt/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-sm">
            <Sparkles size={16} className="text-cobalt" /> Snap, style, take it home
          </p>
          <h1 className="mt-6 font-display text-6xl font-extrabold leading-[0.95] tracking-tight sm:text-8xl">
            Four frames.<br /><span className="text-cobalt">Three seconds</span> each.
          </h1>
          <p className="mt-6 max-w-md text-lg text-ink/70">Find your shots in the gallery, add frames, filters and props, then download or print.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/gallery" className="inline-flex items-center gap-2 rounded-full bg-cobalt px-7 py-4 font-semibold text-white shadow-lg shadow-cobalt/30 transition hover:-translate-y-0.5">
              <Images size={18} /> Open gallery
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border-2 border-ink px-7 py-4 font-semibold transition hover:bg-ink hover:text-paper">
              <Camera size={18} /> Booth operator
            </Link>
          </div>
        </div>
        <div className="relative mx-auto hidden h-[32rem] w-80 lg:block" aria-hidden>
          <Strip className="left-0 top-8" r="-6deg" />
          <Strip className="right-0 top-0" r="5deg" />
        </div>
      </div>
    </main>
  );
}
