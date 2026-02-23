export default function Loading() {
  return (
    <div className="space-y-4 animate-in fade-in-0 duration-200">
      <div className="h-10 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-muted/80 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  )
}
