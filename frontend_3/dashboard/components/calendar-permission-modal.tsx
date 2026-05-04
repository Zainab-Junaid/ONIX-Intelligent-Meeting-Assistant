"use client"

import React, { useEffect, useState } from 'react'
import { useAuth } from './auth-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar, X } from 'lucide-react'

export function CalendarPermissionModal() {
  const { authUser, isFirstTimeUser, hasCalendarAccess, requestCalendarAccess } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    // Show modal for first-time users who haven't granted calendar access
    if (authUser && isFirstTimeUser && !hasCalendarAccess) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [authUser, isFirstTimeUser, hasCalendarAccess])

  const handleGrantAccess = async () => {
    setIsRequesting(true)
    try {
      const success = await requestCalendarAccess()
      if (success) {
        setIsOpen(false)
      } else {
        // User cancelled or closed popup - just close modal silently
        setIsOpen(false)
      }
    } catch (error: any) {
      console.error('Failed to request calendar access:', error)
      // Only show error if it's not a user cancellation
      if (error.code !== 'auth/popup-closed-by-user' && !error.message?.includes('popup')) {
        alert('Failed to request calendar access. Please try again.')
      }
    } finally {
      setIsRequesting(false)
    }
  }

  const handleSkip = () => {
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <DialogTitle className="text-2xl">Connect Google Calendar</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            To help you manage your meetings better, we'd like to access your Google Calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">What we'll do:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
              <li>View your calendar events to identify meetings</li>
              <li>Create calendar events for scheduled meetings</li>
              <li>Sync meeting transcripts with your calendar</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Your privacy:</h4>
            <p className="text-sm text-muted-foreground">
              We only access calendar data necessary for meeting management. 
              You can revoke access at any time in your account settings.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isRequesting}
          >
            Skip for now
          </Button>
          <Button
            onClick={handleGrantAccess}
            disabled={isRequesting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isRequesting ? 'Connecting...' : 'Grant Access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

