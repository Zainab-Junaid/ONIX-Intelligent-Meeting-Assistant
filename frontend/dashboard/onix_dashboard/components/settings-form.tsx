"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

const NAME_KEY = "onix_workspace_name"
const EMAIL_KEY = "onix_notification_email"

export function SettingsForm() {
  const { toast } = useToast()
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
    </form>
  )
}

export default SettingsForm
