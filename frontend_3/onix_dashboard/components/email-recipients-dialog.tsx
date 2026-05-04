import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Plus, Mail, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface EmailRecipientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (recipients: string[]) => Promise<void>
  defaultRecipients: string[]
  isLoading: boolean
}

export function EmailRecipientsDialog({
  open,
  onOpenChange,
  onSend,
  defaultRecipients,
  isLoading
}: EmailRecipientsDialogProps) {
  const [recipients, setRecipients] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [error, setError] = useState("")

  // Reset recipients when dialog opens
  useEffect(() => {
    if (open) {
      setRecipients([...defaultRecipients])
      setNewEmail("")
      setError("")
    }
  }, [open, defaultRecipients])

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.([^<>()[\]\\.,;:\s@"]+))*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      )
  }

  const handleAddEmail = () => {
    const email = newEmail.trim()
    if (!email) return

    if (!validateEmail(email)) {
      setError("Please enter a valid email address")
      return
    }

    if (recipients.includes(email)) {
      setError("This email is already added")
      return
    }

    setRecipients([...recipients, email])
    setNewEmail("")
    setError("")
  }

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients(recipients.filter(email => email !== emailToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddEmail()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Meeting Summary</DialogTitle>
          <DialogDescription>
            Participants from your Google Calendar are shown below. Add or remove anyone before sending.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
                <Label>Add Recipient</Label>
                <div className="flex gap-2">
                    <Input
                        placeholder="colleague@example.com"
                        value={newEmail}
                        onChange={(e) => {
                            setNewEmail(e.target.value)
                            setError("")
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                    />
                    <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleAddEmail}
                        disabled={!newEmail || isLoading}
                    >
                        <Plus className="size-4" />
                    </Button>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="space-y-2">
                <Label>Recipients ({recipients.length})</Label>
                <div className="min-h-[100px] max-h-[200px] overflow-y-auto p-3 border rounded-md bg-slate-50">
                    {recipients.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {isLoading ? "Loading participants from calendar…" : "No recipients added yet. Add recipients above."}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {recipients.map((email) => (
                                <Badge key={email} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 bg-white border-slate-200">
                                    {email}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveRecipient(email)}
                                        className="ml-1 hover:bg-slate-100 rounded-full p-0.5 text-slate-500 hover:text-red-500 transition-colors"
                                        disabled={isLoading}
                                    >
                                        <X className="size-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={() => onSend(recipients)} 
            disabled={isLoading || recipients.length === 0}
            className="gap-2"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
