/**
 * Skeleton loading card for bounty list.
 * Shows animated shimmer placeholders while bounties load from relays.
 */
export default function BountySkeleton() {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-5 bg-zinc-800 rounded w-3/4" />
          <div className="h-4 bg-zinc-800/60 rounded w-full" />
          <div className="h-4 bg-zinc-800/60 rounded w-2/3" />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="h-6 bg-orange-500/10 rounded w-20" />
          <div className="h-5 bg-zinc-800 rounded w-16" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="h-3 bg-zinc-800/50 rounded w-20" />
        <div className="h-3 bg-zinc-800/50 rounded w-12" />
        <div className="h-3 bg-zinc-800/50 rounded w-16" />
      </div>
    </div>
  );
}

export function BountySkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <BountySkeleton key={i} />
      ))}
    </div>
  );
}
