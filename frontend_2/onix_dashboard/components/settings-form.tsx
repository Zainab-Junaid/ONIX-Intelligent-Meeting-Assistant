"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

import { useAuth } from "@/components/auth-provider"

const NAME_KEY = "onix_workspace_name"
const EMAIL_KEY = "onix_notification_email"

export function SettingsForm() {
  const { toast } = useToast()
  const { authUser, hasCalendarAccess } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

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

  return (
    <form className="max-w-xl space-y-4" onSubmit={handleSubmit}>
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

      <div className="pt-6 border-t">
        <h3 className="text-lg font-medium mb-4">Integrations</h3>
        <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center size-10 rounded-full bg-white border shadow-sm">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 2V6" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 2V6" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 10H21" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-sm">Google Calendar</p>
              <p className="text-xs text-muted-foreground">Sync your meetings automatically</p>
            </div>
          </div>
          {hasCalendarAccess ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                try {
                  const token = await authUser?.getIdToken()
                  if (!token) return

                  const res = await fetch('/api/calendar/disconnect', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  })

                  if (res.ok) {
                    toast({ title: "Disconnected", description: "Calendar has been disconnected. Refreshing..." })
                    setTimeout(() => window.location.reload(), 1000)
                  } else {
                    toast({ title: "Error", description: "Failed to disconnect calendar.", variant: "destructive" })
                  }
                } catch (err) {
                  console.error('Error disconnecting', err)
                  toast({ title: "Error", description: "Something went wrong.", variant: "destructive" })
                }
              }}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const token = await authUser?.getIdToken()
                  if (!token) return

                  const res = await fetch('/api/calendar/request-access', {
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  })
                  const data = await res.json()
                  if (data.oauthUrl) {
                    window.location.href = data.oauthUrl;
                  } else {
                    console.error('Failed to get OAuth URL', data);
                    toast({ title: "Error", description: "Failed to initiate connection.", variant: "destructive" })
                  }
                } catch (err) {
                  console.error('Error requesting access', err)
                  toast({ title: "Error", description: "Something went wrong.", variant: "destructive" })
                }
              }}
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

export default SettingsForm
