export default function Loading() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="w-0 md:w-[280px] shrink-0 border-r bg-sidebar md:sticky md:top-0 md:h-screen" aria-hidden />
        <section className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="rounded-2xl border border-border bg-card min-h-[calc(100dvh-3rem)] md:min-h-[calc(100dvh-5rem)]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-muted animate-pulse" />
                <div className="flex flex-col gap-2">
                  <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
                  <div className="h-4 w-32 rounded bg-muted/70 animate-pulse" />
                </div>
              </div>
            </header>
            <div className="px-6 pb-8 pt-5">
              <div className="space-y-4">
                <div className="h-10 w-full max-w-sm rounded-lg bg-muted animate-pulse" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 rounded-2xl bg-muted/80 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
                <div className="h-64 rounded-2xl bg-muted/60 animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
