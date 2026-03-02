export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <div className="text-center">
        <span className="text-4xl animate-pulse">⚡</span>
        <p className="text-zinc-400 mt-4 text-sm">Loading bounties...</p>
      </div>
    </main>
  );
}
