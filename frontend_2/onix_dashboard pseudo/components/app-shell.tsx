"use client"

import type React from "react"
import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar - Slides in/out smoothly */}
        <aside
          className={`shrink-0 border-r bg-sidebar transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? "w-[280px]" : "w-0"
            }`}
          aria-label="Primary"
        >
          <Sidebar onClose={() => setIsSidebarOpen(false)} />
        </aside>

        {/* Content */}
        <section className="flex-1 p-4 md:p-6 lg:p-8 transition-all duration-300 ease-in-out">
          <div className="rounded-2xl border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
              <div className="flex items-center gap-3">
                {/* Hamburger Menu Button - All screen sizes */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  aria-label="Toggle menu"
                >
                  <Menu className="size-5" />
                </Button>
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
