import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <span className="text-6xl mb-4 block">⚡</span>
        <h2 className="text-2xl font-bold text-orange-400 mb-2">404</h2>
        <p className="text-zinc-400 mb-6">
          This bounty doesn&apos;t exist — or it was zapped into the void.
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-orange-500 text-black rounded-lg font-semibold hover:bg-orange-400 transition inline-block"
        >
          Browse Bounties
        </Link>
      </div>
    </main>
  );
}
