"use client"

import { cn } from "@/lib/utils"

/**
 * Custom chatbot icon: two squares connected by a thin horizontal line (minimalist chat/bot symbol).
 */
export function ChatbotIcon({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Left square */}
      <rect x="4" y="9" width="6" height="6" rx="0.5" fill="currentColor" />
      {/* Connector line */}
      <rect x="11" y="11.5" width="2" height="1" fill="currentColor" />
      {/* Right square */}
      <rect x="14" y="9" width="6" height="6" rx="0.5" fill="currentColor" />
    </svg>
  )
}
