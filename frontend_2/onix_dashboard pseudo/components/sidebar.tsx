"use client"

import type React from "react"
import Link from "next/link"
import {
  Archive,
  Bot,
  CalendarCheck2,
  ChevronRight,
  Cog,
  LayoutDashboard,
  Search,
  StickyNote,
  FileText,
  BarChart3,
  CheckSquare,
  X,
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
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-sidebar-accent",
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

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { authUser, signInWithGoogle, signOutUser } = useAuth()
  return (
    <div className="flex h-dvh w-[280px] flex-col gap-3 p-4">
      {/* Logo */}
      <Link href="/" prefetch className="flex items-center justify-center rounded-lg px-3 py-6">
        <img src="/images/onix.png" alt="Onix" className="h-24 w-auto max-w-full object-contain md:h-28" />
        <span className="sr-only">Onix</span>
      </Link>

      {/* Nav Items */}
      <div className="scrollbar-thin -mr-2 flex-1 overflow-y-auto pr-2">
        <nav className="mt-3 space-y-1">
          <NavItem icon={LayoutDashboard} href="/">Dashboard</NavItem>
          <NavItem icon={CalendarCheck2} href="/meetings">Meetings</NavItem>
          <NavItem icon={BarChart3} href="/speaker-stats">Speaker Stats</NavItem>
          <NavItem icon={CheckSquare} href="/tasks">My Tasks</NavItem>
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
      <div className="mt-1 flex items-center justify-between gap-3 rounded-xl px-2 py-2">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-muted font-medium">
            {authUser?.displayName?.[0] || '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{authUser?.displayName || 'Not signed in'}</p>
            <p className="truncate text-xs text-muted-foreground">{authUser?.email || 'Sign in to sync'}</p>
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

      {/* Auth Button */}
      <div className="px-2 mt-2">
        {authUser ? (
          <Button className="w-full rounded-lg" onClick={signOutUser}>Sign out</Button>
        ) : (
          <Button className="w-full rounded-lg" onClick={signInWithGoogle}>Sign in</Button>
        )}
      </div>
    </div>
  )
}
