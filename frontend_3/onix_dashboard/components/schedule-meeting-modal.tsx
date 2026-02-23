"use client"

import { useState } from "react"
import { CalendarIcon, Clock, Users, Plus, X } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth-provider"

export function ScheduleMeetingModal() {
    const { authUser } = useAuth()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState("")
    const [date, setDate] = useState<Date>()
    const [time, setTime] = useState("10:00")
    const [duration, setDuration] = useState("30")
    const [description, setDescription] = useState("")
    const [attendeeInput, setAttendeeInput] = useState("")
    const [attendees, setAttendees] = useState<string[]>([])

    const addAttendee = () => {
        console.log('addAttendee called, input:', attendeeInput);
        console.log('Current attendees:', attendees);
        if (attendeeInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeInput)) {
            if (!attendees.includes(attendeeInput)) {
                const newAttendees = [...attendees, attendeeInput];
                console.log('Adding attendee, new array:', newAttendees);
                setAttendees(newAttendees)
            } else {
                console.log('Attendee already exists');
            }
            setAttendeeInput("")
        } else {
            console.log('Invalid email:', attendeeInput);
        }
    }

    const removeAttendee = (email: string) => {
        setAttendees(attendees.filter(a => a !== email))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addAttendee()
        }
    }

    const handleSubmit = async () => {
        if (!title || !date || !time) return

        setLoading(true)
        try {
            const token = await authUser?.getIdToken()
            if (!token) throw new Error("No auth token")

            const [hours, minutes] = time.split(':').map(Number)
            const startTime = new Date(date)
            startTime.setHours(hours, minutes)

            console.log('=== SCHEDULING MEETING ===');
            console.log('Title:', title);
            console.log('Attendees array:', attendees);
            console.log('Attendees length:', attendees.length);

            const response = await fetch('/api/calendar/create-event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    summary: title,
                    description,
                    startTime: startTime.toISOString(),
                    durationMinutes: parseInt(duration) === 0 ? 30 : parseInt(duration), // Default to 30 if unspecified
                    attendees: attendees
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.message || 'Failed to schedule meeting')
            }

            setOpen(false)
            // Reset form
            setTitle("")
            setDate(undefined)
            setTime("10:00")
            setAttendees([])
            setDescription("")

            // Trigger refresh (optional, page might need manual refresh or callback)
            window.location.reload()

        } catch (error) {
            console.error("Error scheduling meeting:", error)
            alert("Failed to schedule meeting. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-blue-500 hover:bg-blue-600">
                    <Plus className="size-4 mr-2" />
                    Schedule Meeting
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Schedule a Meeting</DialogTitle>
                    <DialogDescription>
                        Create a new meeting in your Google Calendar and invite participants.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="title">Event Title</Label>
                        <Input
                            id="title"
                            placeholder="e.g., Weekly Sync"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={date ? format(date, "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                    const selectedDate = e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined
                                    setDate(selectedDate)
                                }}
                                className="w-full"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="time">Time</Label>
                            <Input
                                id="time"
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Duration</Label>
                            <Select value={duration} onValueChange={setDuration}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select duration" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Not specified</SelectItem>
                                    <SelectItem value="15">15 minutes</SelectItem>
                                    <SelectItem value="30">30 minutes</SelectItem>
                                    <SelectItem value="45">45 minutes</SelectItem>
                                    <SelectItem value="60">1 hour</SelectItem>
                                    <SelectItem value="90">1.5 hours</SelectItem>
                                    <SelectItem value="120">2 hours</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="attendees">Participants (optional)</Label>
                        <div className="flex gap-2">
                            <Input
                                id="attendees"
                                placeholder="Type email and click + to add"
                                value={attendeeInput}
                                onChange={(e) => setAttendeeInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                            <Button type="button" variant="secondary" onClick={addAttendee} size="icon" title="Add participant">
                                <Plus className="size-4" />
                            </Button>
                        </div>
                        {attendees.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {attendees.map((email) => (
                                    <div key={email} className="bg-slate-100 text-slate-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                        <span>{email}</span>
                                        <button onClick={() => removeAttendee(email)} className="text-slate-400 hover:text-slate-600">
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                            id="description"
                            placeholder="Meeting agenda..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading || !title || !date}>
                        {loading ? "Scheduling..." : "Schedule Meeting"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
