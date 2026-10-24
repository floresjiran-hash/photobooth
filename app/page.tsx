import Link from "next/link";
import { Camera, Images, Palette, Smile } from "lucide-react";

const frames = [
  { bg: "bg-sodium", face: "😎" },
  { bg: "bg-tomato", face: "🥳" },
  { bg: "bg-mint", face: "😜" },
  { bg: "bg-[#c9b8ff]", face: "🤩" },
];

const steps = [
  { icon: Smile, title: "Strike a pose", text: "Step into the booth. Four quick shots, three seconds each, with filters and props." },
  { icon: Images, title: "Find your strip", text: "Your photos land on the gallery wall the moment they're taken. Scan the QR code to open yours." },
  { icon: Palette, title: "Style and take it home", text: "Pick a layout, frame, stickers and a title, then download or print your strip." },
];

function Burst() {
  const pts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 44 : 50; return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`; }).join(" ");
  return <svg viewBox="0 0 100 100" aria-hidden className="spin-slow absolute left-1/2 top-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2"><polygon points={pts} fill="#ffc83d" stroke="#16120e" strokeWidth="1" /></svg>;
}

export default function Home() {
  return (
    <main className="overflow-hidden">
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-bold shadow-sm">
            <span className="size-2 rounded-full bg-tomato" /> Now taking photos
          </p>
          <h1 className="mt-6 text-6xl font-black leading-[0.95] tracking-tight sm:text-8xl">
            Strike a pose.<br />
            <span className="relative inline-block">
              Take it home.
              <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden className="absolute -bottom-2 left-0 h-3 w-full"><path d="M2 9 Q 20 1 40 8 T 80 8 T 120 8 T 160 8 T 200 8 T 240 8 T 298 7" fill="none" stroke="#ef4b2b" strokeWidth="4" strokeLinecap="round" /></svg>
            </span>
          </h1>
          <p className="mt-8 max-w-md text-lg text-ink/75">Four frames, three seconds each. Find your strip on the gallery wall, dress it up with frames and props, and take it home.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/gallery" className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-sodium px-7 py-4 font-bold shadow-lg transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-md">
              <Images size={18} /> Open the gallery
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-7 py-4 font-bold shadow-lg transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-md">
              <Camera size={18} /> Booth operator
            </Link>
          </div>
        </div>

        <div className="relative mx-auto hidden h-[34rem] w-80 lg:block" aria-hidden>
          <Burst />
          <div className="floaty absolute left-1/2 top-4 w-48 -translate-x-1/2 border-2 border-ink bg-white p-3 shadow-2xl" style={{ ["--r" as string]: "5deg" }}>
            {frames.map((f) => <div key={f.face} className={`mb-3 grid aspect-[4/3] place-items-center border-2 border-ink text-4xl ${f.bg}`}>{f.face}</div>)}
            <p className="text-center font-display text-xs font-black tracking-[0.25em]">PHOTO BOOTH</p>
          </div>
        </div>
      </section>

      <section className="border-y-2 border-ink bg-ink py-3 text-paper" aria-hidden>
        <p className="whitespace-nowrap text-center font-display text-lg font-black tracking-[0.3em]">SMILE ✦ FLASH ✦ PRINT ✦ REPEAT ✦ SMILE ✦ FLASH ✦ PRINT ✦ REPEAT</p>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
        <h2 className="text-4xl font-black sm:text-5xl">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-display text-6xl font-black text-tomato">{i + 1}</span>
                <span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-mint"><s.icon size={22} /></span>
              </div>
              <h3 className="mt-4 text-2xl font-black">{s.title}</h3>
              <p className="mt-2 text-ink/75">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t-2 border-ink px-4 py-8 text-center text-sm font-semibold text-ink/70">Photo Booth · Smile, you're on camera</footer>
    </main>
  );
}