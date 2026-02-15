"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), [])

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar - Slides in/out smoothly */}
        <aside
          className={`shrink-0 border-r bg-sidebar transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? (isCollapsed ? "w-[70px]" : "w-[280px]") : "w-0"
            } fixed inset-y-0 left-0 z-50 md:sticky md:top-0 md:h-screen md:z-30`}
          aria-label="Primary"
        >
          <Sidebar
            onClose={handleCloseSidebar}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        </aside>

        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Content */}
        <section className="flex-1 p-4 md:p-6 lg:p-8 transition-all duration-300 ease-in-out">
          <div className="rounded-2xl border bg-card min-h-[calc(100dvh-3rem)] md:min-h-[calc(100dvh-5rem)]">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
              <div className="flex items-center gap-3">
                {/* Hamburger Menu Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (window.innerWidth >= 768) {
                      // Desktop: toggle collapse
                      setIsCollapsed(!isCollapsed)
                    } else {
                      // Mobile: toggle open/close
                      setIsSidebarOpen(!isSidebarOpen)
                    }
                  }}
                  aria-label="Toggle menu"
                >
                  <Menu className="size-5" />
                </Button>
                <div className="flex flex-col">
                  <h1 className="text-balance text-2xl font-semibold leading-tight">{title}</h1>
                  {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
                </div>
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
