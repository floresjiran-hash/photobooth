import Link from "next/link";
import { Camera, Images } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-xl w-full">
        <h1 className="font-display text-6xl sm:text-7xl font-extrabold leading-[0.95] tracking-tight">
          Four frames.<br />Three seconds each.
        </h1>
        <p className="mt-5 text-lg text-ink/70">Find your shots in the gallery, dress them up, and take them home.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/gallery" className="inline-flex items-center gap-2 rounded-full bg-cobalt text-white px-6 py-3 font-semibold hover:bg-cobalt/90">
            <Images size={18} /> Open gallery
          </Link>
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border-2 border-ink px-6 py-3 font-semibold hover:bg-ink hover:text-paper">
            <Camera size={18} /> Booth operator
          </Link>
        </div>
      </div>
    </main>
  );
}
