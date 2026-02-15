"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import {
  Archive,
  Bot,
  CalendarCheck2,
  ChevronRight,
  Cog,
  LayoutDashboard,
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button" // ✅ import Button
import { useAuth } from "@/components/auth-provider"

function NavItem({
  icon: Icon,
  children,
  href,
  trailing,
}: {
  icon: React.ElementType
  children: React.ReactNode
  href: string
  trailing?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-1 text-left text-sm hover:bg-sidebar-accent",
      )}
    >
      <span className="flex items-center gap-3">
        <Icon className="size-5" aria-hidden />
        <span>{children}</span>
      </span>
      {trailing}
    </Link>
  )
}

export function Sidebar() {
  const { authUser, signInWithGoogle, signOutUser, hasCalendarAccess, requestCalendarAccess } = useAuth()
  const [isConnecting, setIsConnecting] = useState(false)
  return (
    <div className="flex h-screen w-[280px] flex-col gap-0.5 p-4 pt-1 overflow-hidden">
      {/* Logo */}
      <Link href="/" prefetch className="flex items-center justify-center rounded-lg px-3 py-0">
        <img src="/images/onix.png" alt="Onix" className="h-24 w-auto max-w-full object-contain md:h-28" />
        <span className="sr-only">Onix</span>
      </Link>

      {/* Nav Items */}
      <div className="flex-1 overflow-hidden">
        <nav className="mt-0 space-y-1">
          <NavItem icon={LayoutDashboard} href="/">Dashboard</NavItem>
          <NavItem icon={Search} href="/search">Search</NavItem>
          <NavItem icon={CalendarCheck2} href="/meetings">Meetings</NavItem>
          <NavItem icon={Calendar} href="/schedule">Schedule</NavItem>
          <NavItem icon={Bot} href="/ai-tools">Chat with me!</NavItem>
          <NavItem
            icon={Cog}
            href="/settings"
            trailing={<ChevronRight className="size-4 text-muted-foreground" />}
          >
            Account &amp; Settings
          </NavItem>
          <NavItem icon={Archive} href="/archive">Archive</NavItem>
        </nav>
      </div>

      {/* User Block */}
      <div className="mt-auto flex items-center justify-between gap-2 rounded-xl px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-full bg-muted font-medium text-xs">
            {authUser?.displayName?.[0] || '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{authUser?.displayName || 'Not signed in'}</p>
            <p className="truncate text-[10px] text-muted-foreground">{authUser?.email || 'Sign in to sync'}</p>
          </div>
        </div>
        <Link
          href="/settings"
          className="grid size-6 place-items-center rounded-full border text-xs"
          aria-label="Open settings"
          title="Open settings"
        >
          ⚙
        </Link>
      </div>

      {/* Calendar Connection Status */}
      {authUser && (
        <div className="px-2 mt-0.5">
          <div className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 bg-muted/50">
            <div className="flex items-center gap-2 min-w-0">
              {hasCalendarAccess ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate">Calendar connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate">Calendar not connected</span>
                </>
              )}
            </div>
            {!hasCalendarAccess && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] flex-shrink-0"
                onClick={async () => {
                  setIsConnecting(true)
                  try {
                    await requestCalendarAccess()
                  } catch (error) {
                    console.error('Failed to connect calendar:', error)
                  } finally {
                    setIsConnecting(false)
                  }
                }}
                disabled={isConnecting}
              >
                {isConnecting ? '...' : <Calendar className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Auth Button */}
      <div className="px-2 mt-1 mb-1">
        {authUser ? (
          <Button size="sm" className="w-full rounded-lg" onClick={signOutUser}>Sign out</Button>
        ) : (
          <Button size="sm" className="w-full rounded-lg" onClick={signInWithGoogle}>Sign in</Button>
        )}
      </div>
    </div>
  )
}
