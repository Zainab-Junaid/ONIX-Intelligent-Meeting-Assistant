"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, memo } from "react"
import {
  Archive,
  CalendarCheck2,
  CalendarClock,
  ChevronRight,
  Cog,
  LayoutDashboard,
  X,
} from "lucide-react"
import { ChatbotIcon } from "@/components/icons/chatbot-icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import { useIsMobile } from "@/hooks/use-mobile"

const NavItem = memo(function NavItem({
  icon: Icon,
  children,
  href,
  trailing,
  isCollapsed = false,
}: {
  icon: React.ElementType
  children: React.ReactNode
  href: string
  trailing?: React.ReactNode
  isCollapsed?: boolean
}) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href)

  if (isCollapsed) {
    return (
      <Link
        href={href}
        prefetch
        className={cn(
          "flex items-center justify-center rounded-xl p-2.5 transition-colors duration-150 mb-1 group",
          isActive
            ? "bg-blue-600 text-white dark:bg-blue-600 dark:text-white"
            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        )}
        title={String(children)}
      >
        <Icon className={cn("size-5", isActive ? "text-white" : "text-slate-500 dark:text-slate-400")} />
      </Link>
    )
  }

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 mb-1 group",
        isActive
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      )}
    >
      {/* Subtle shine effect for active item */}
      {/* Subtle shine effect for active item - Removed for stability */}


      <span className="flex items-center gap-3 relative z-10">
        <Icon className={cn("size-5", isActive ? "text-white" : "text-slate-600 dark:text-slate-300")} />
        <span>{children}</span>
      </span>
      {trailing && <div className="relative z-10">{trailing}</div>}
    </Link>
  )
})

export function Sidebar({
  onClose,
  isCollapsed = false,
  onToggleCollapse
}: {
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const { authUser, signInWithGoogle, signOutUser } = useAuth()
  const pathname = usePathname()
  const isMobile = useIsMobile()

  // Close sidebar when route changes, but only on mobile
  useEffect(() => {
    if (isMobile) {
      onClose?.()
    }
  }, [pathname, onClose, isMobile])

  return (
    <div className={cn(
      "flex h-dvh flex-col gap-4 p-6 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transition-all duration-300",
      isCollapsed ? "w-[70px] p-3 items-center" : "w-[280px]"
    )}>
      {/* Logo & Close button for mobile */}
      <div className="flex items-center justify-between relative px-2">
        {!isCollapsed ? (
          <Link href="/" prefetch className="flex items-center justify-center w-full">
            <img src="/images/onix.png" alt="Onix" className="h-12 w-auto object-contain" />
          </Link>
        ) : (
          <Link href="/" prefetch className="flex items-center justify-center w-full">
            <img src="/images/onix.png" alt="Onix" className="h-8 w-auto object-contain" />
          </Link>
        )}
        {onClose && !isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden absolute right-0 top-2"
          >
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Nav Items */}
      <div className="flex-1">
        <nav className="space-y-0.5">
          <NavItem icon={LayoutDashboard} href="/" isCollapsed={isCollapsed}>Dashboard</NavItem>
          <NavItem icon={CalendarCheck2} href="/meetings" isCollapsed={isCollapsed}>Meetings</NavItem>
          <NavItem icon={CalendarClock} href="/schedule" isCollapsed={isCollapsed}>Schedule</NavItem>
          <NavItem icon={ChatbotIcon} href="/ai-tools" isCollapsed={isCollapsed}>Chat with me!</NavItem>
          <NavItem
            icon={Cog}
            href="/settings"
            trailing={!isCollapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : undefined}
            isCollapsed={isCollapsed}
          >
            Account & Settings
          </NavItem>
          <NavItem icon={Archive} href="/archive" isCollapsed={isCollapsed}>Archive</NavItem>
        </nav>
      </div>

      {/* User Block */}
      <div className="mt-auto">
        {!isCollapsed ? (
          <>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-3 mb-3 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-full bg-blue-500 text-white font-semibold text-xs shrink-0">
                  {authUser?.displayName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-50 break-words">{authUser?.displayName || 'Guest User'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{authUser?.email || 'Not signed in'}</p>
                </div>
                <Link
                  href="/settings"
                  className="grid size-6 place-items-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors shrink-0"
                >
                  <Cog className="size-3.5" />
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed User Avatar */}
            <Link href="/settings" className="flex items-center justify-center mx-auto mb-2">
              <div className="grid size-10 place-items-center rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                {authUser?.displayName?.[0] || '?'}
              </div>
            </Link>

          </>
        )}

        {/* Auth Button */}

        {!isCollapsed && (
          authUser ? (
            <Button
              className="w-full rounded-xl h-11 font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 shadow-none transition-colors"
              onClick={() => {
                signOutUser()
                onClose?.()
              }}
            >
              Sign out
            </Button>
          ) : (
            <Button
              className="w-full rounded-xl h-11 font-medium bg-blue-600 hover:bg-blue-700 shadow-sm"
              onClick={() => {
                signInWithGoogle()
                onClose?.()
              }}
            >
              Sign in
            </Button>
          )
        )}
      </div>
    </div >
  )
}
