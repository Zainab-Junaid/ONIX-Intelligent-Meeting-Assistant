import type React from "react"
import { Sidebar } from "@/components/sidebar"

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: React.ReactNode // changed from string to React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <aside className="hidden shrink-0 border-r bg-sidebar md:block" aria-label="Primary">
          <Sidebar />
        </aside>

        {/* Content */}
        <section className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="rounded-2xl border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
              <div className="flex items-center gap-3">
                {/* Removed empty decorative box next to title */}
                <h1 className="text-balance text-2xl font-semibold">{title}</h1>
                {subtitle ? <span className="ml-1 text-sm text-muted-foreground">{subtitle}</span> : null}
              </div>
              {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
            </header>

            <div className="px-6 pb-8 pt-5">{children}</div>
          </div>
        </section>
      </div>
    </main>
  )
}
