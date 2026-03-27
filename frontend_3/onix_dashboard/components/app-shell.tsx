"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu, Search } from "lucide-react"

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
  const [globalSearchQuery, setGlobalSearchQuery] = useState("")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), [])

  const isMeetingsPage = pathname === "/meetings"
  const meetingsQuery = searchParams.get("q") ?? ""

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (isMeetingsPage) return
    const q = globalSearchQuery.trim()
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  const searchValue = isMeetingsPage ? meetingsQuery : globalSearchQuery
  const setSearchValue = useCallback(
    (value: string) => {
      if (isMeetingsPage) {
        const params = new URLSearchParams(searchParams.toString())
        if (value.trim()) params.set("q", value)
        else params.delete("q")
        const query = params.toString()
        router.replace(`/meetings${query ? `?${query}` : ""}`)
      } else {
        setGlobalSearchQuery(value)
      }
    },
    [isMeetingsPage, searchParams, router]
  )

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar - Slides in/out smoothly */}
        <aside
          className={`shrink-0 border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? (isCollapsed ? "w-[70px]" : "w-[280px]") : "w-0"
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
          <div className="rounded-2xl border border-border bg-card min-h-[calc(100dvh-3rem)] md:min-h-[calc(100dvh-5rem)]">
            <header className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-5">
              <div className="flex items-center gap-3 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (typeof window !== "undefined" && window.innerWidth >= 768) {
                      setIsCollapsed(!isCollapsed)
                    } else {
                      setIsSidebarOpen(!isSidebarOpen)
                    }
                  }}
                  aria-label="Toggle menu"
                >
                  <Menu className="size-5" />
                </Button>
                <div className="flex flex-col">
                  <h1 className="text-balance text-2xl font-semibold leading-tight text-foreground">{title}</h1>
                  {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
                </div>
              </div>
              {!pathname?.startsWith("/transcripts") && (
                <form onSubmit={handleSearch} className="flex-1 min-w-0 max-w-xl mx-4 hidden sm:flex">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="search"
                      placeholder={isMeetingsPage ? "Search meetings..." : "Search for meeting or feature..."}
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      className="w-full pl-9 pr-4 h-10 rounded-xl bg-muted/50 border-border focus-visible:ring-2"
                      aria-label="Search"
                    />
                  </div>
                </form>
              )}
              {actions ? <div className="flex items-center gap-2 shrink-0 ml-auto">{actions}</div> : null}
            </header>

            <div className="px-6 pb-8 pt-5">{children}</div>
          </div>
        </section>
      </div>
    </main>
  )
}
