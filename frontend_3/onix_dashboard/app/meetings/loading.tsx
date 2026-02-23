export default function Loading() {
  return (
    <div className="space-y-4 animate-in fade-in-0 duration-200">
      <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
      <div className="flex gap-2">
        <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted/80 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  )
}
