import { ChaseApp } from "@/components/ChaseApp";

export default function Home() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(59,130,246,0.1),_transparent_50%)]"
      />
      <ChaseApp />
    </main>
  );
}
