"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { Calendar, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const NAME_KEY = "onix_workspace_name"
const EMAIL_KEY = "onix_notification_email"

export function SettingsForm() {
  const { toast } = useToast()
  const { authUser, hasCalendarAccess, requestCalendarAccess } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(NAME_KEY) || ""
      const savedEmail = localStorage.getItem(EMAIL_KEY) || ""
      setName(savedName)
      setEmail(savedEmail)
    } catch {
      // ignore read errors
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      localStorage.setItem(NAME_KEY, name.trim())
      localStorage.setItem(EMAIL_KEY, email.trim())
      toast({ title: "Saved", description: "Your settings have been saved." })
    } catch {
      toast({ title: "Could not save", description: "Please try again.", variant: "destructive" })
    }
  }

  async function handleConnectCalendar() {
    if (!authUser) {
      toast({ 
        title: "Sign in required", 
        description: "Please sign in to connect your calendar.", 
        variant: "destructive" 
      })
      return
    }

    setIsConnecting(true)
    try {
      const success = await requestCalendarAccess()
      if (success) {
        toast({ 
          title: "Calendar connected", 
          description: "Your Google Calendar has been successfully connected." 
        })
      } else {
        toast({ 
          title: "Connection cancelled", 
          description: "Calendar connection was cancelled.", 
          variant: "destructive" 
        })
      }
    } catch (error: any) {
      toast({ 
        title: "Connection failed", 
        description: error.message || "Failed to connect calendar. Please try again.", 
        variant: "destructive" 
      })
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Calendar Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <CardTitle>Google Calendar</CardTitle>
          </div>
          <CardDescription>
            Connect your Google Calendar to sync meetings and events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasCalendarAccess ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Not connected</span>
                </>
              )}
            </div>
            {!hasCalendarAccess && (
              <Button
                onClick={handleConnectCalendar}
                disabled={isConnecting || !authUser}
                className="rounded-lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Calendar className="mr-2 h-4 w-4" />
                    Connect Calendar
                  </>
                )}
              </Button>
            )}
          </div>
          {hasCalendarAccess && (
            <p className="text-xs text-muted-foreground">
              Your calendar is connected. You can view and manage your events from the app.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Settings</CardTitle>
          <CardDescription>Manage your workspace preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                placeholder="Onix Workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="organization"
              />
            </div>
            <div>
              <Label htmlFor="email">Notification email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="rounded-lg">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsForm
