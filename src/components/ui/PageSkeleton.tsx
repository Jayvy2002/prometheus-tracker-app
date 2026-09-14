export function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 animate-pulse">
      <div className="h-4 bg-neutral-800 rounded-md w-1/3 mb-3" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 bg-neutral-800/60 rounded-xl w-full mb-2 last:mb-0" />
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-neutral-900 animate-pulse" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="px-4 pt-6 space-y-3">
      <div className="h-8 w-40 bg-neutral-900 rounded-lg animate-pulse" />
      <CardSkeleton />
      <ListSkeleton />
    </div>
  );
}
