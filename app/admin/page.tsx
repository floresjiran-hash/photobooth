"use client";
import Link from "next/link";
import AdminGate from "@/components/AdminGate";
import CameraFeed from "@/components/CameraFeed";

export default function AdminPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        <div className="mb-6 flex items-baseline gap-4">
          <h1 className="font-display text-4xl font-extrabold">Capture station</h1>
          <Link href="/gallery" className="text-cobalt underline underline-offset-4">View gallery</Link>
        </div>
        <CameraFeed />
      </main>
    </AdminGate>
  );
}
