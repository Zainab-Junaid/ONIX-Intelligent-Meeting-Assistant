"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bot, Video, ArrowLeft } from "lucide-react"
import { useAuth } from "@/components/auth-provider"

// Google Meet caption language list
const CAPTION_LANGUAGES = [
    "Afrikaans (South Africa)", "Albanian (Albania)", "Amharic (Ethiopia)",
    "Arabic (Egypt)", "Arabic (Levant)", "Arabic (Maghrebi)",
    "Arabic (Peninsular Gulf)", "Arabic (United Arab Emirates)",
    "Armenian (Armenia)", "Azerbaijani (Azerbaijan)", "Basque (Spain)",
    "Bengali (Bangladesh)", "Bulgarian (Bulgaria)", "Burmese (Myanmar)",
    "Catalan (Spain)", "Chinese, Cantonese (Traditional)",
    "Chinese, Mandarin (Simplified)", "Chinese, Mandarin (Traditional)",
    "Czech (Czech Republic)", "Dutch", "English", "English (Australia)",
    "English (India)", "English (Philippines)", "English (UK)",
    "Estonian (Estonia)", "Filipino (Philippines)", "Finnish (Finland)",
    "French", "French (Canada)", "Galician (Spain)", "Georgian (Georgia)",
    "German", "Greek (Greece)", "Gujarati (India)", "Hebrew (Israel)",
    "Hindi", "Hungarian (Hungary)", "Icelandic (Iceland)",
    "Indonesian (Indonesia)", "Italian", "Japanese", "Javanese (Indonesia)",
    "Kannada (India)", "Kazakh (Kazakhstan)", "Khmer (Cambodia)",
    "Kinyarwanda (Rwanda)", "Korean", "Lao (Laos)", "Latvian (Latvia)",
    "Lithuanian (Lithuania)", "Macedonian (North Macedonia)", "Malay (Malaysia)",
    "Malayalam (India)", "Marathi (India)", "Mongolian (Mongolia)",
    "Nepali (Nepal)", "Northern Sotho (South Africa)", "Norwegian (Norway)",
    "Persian (Iran)", "Polish (Poland)", "Portuguese (Brazil)",
    "Portuguese (Portugal)", "Romanian (Romania)", "Russian",
    "Serbian (Serbia)", "Sesotho (South Africa)", "Sinhala (Sri Lanka)",
    "Slovak (Slovakia)", "Slovenian (Slovenia)", "Spanish (Mexico)",
    "Spanish (Spain)", "Sundanese (Indonesia)", "Swahili",
    "Swati (South Africa)", "Swedish (Sweden)", "Tamil (India)",
    "Telugu (India)", "Thai (Thailand)", "Tshivenda (South Africa)",
    "Tswana (South Africa)", "Turkish (Turkey)", "Ukrainian (Ukraine)",
    "Urdu (Pakistan)", "Uzbek (Uzbekistan)", "Vietnamese (Vietnam)",
    "Xhosa (South Africa)", "Xitsonga (South Africa)", "Zulu (South Africa)",
] as const;

interface StartMeetingModalProps {
    isOpen: boolean
    onClose: () => void
    defaultTab?: 'selection' | 'bot'
}

export function StartMeetingModal({ isOpen, onClose, defaultTab = 'selection' }: StartMeetingModalProps) {
    const { authUser } = useAuth()
    const [step, setStep] = useState<'selection' | 'bot'>(defaultTab)
    const [meetingUrl, setMeetingUrl] = useState('')
    const [meetingTitle, setMeetingTitle] = useState('')
    const [captionLanguage, setCaptionLanguage] = useState('English')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleExtensionClick = () => {
        window.open('https://meet.new', '_blank')
        onClose()
    }

    const startMeetingBot = async () => {
        if (!meetingUrl.trim()) {
            setError('Please enter a meeting URL')
            return
        }

        if (!authUser) {
            setError('User not authenticated')
            return
        }

        try {
            setLoading(true)
            setError('')

            // Assuming we get the token from authUser
            const token = await authUser.getIdToken()

            const response = await fetch('/api/meeting-bot/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    meetingUrl: meetingUrl.trim(),
                    meetingTitle: meetingTitle.trim() || 'Bot Meeting',
                    language: captionLanguage,
                })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Failed to start meeting bot')
            }

            // Success
            setMeetingUrl('')
            setMeetingTitle('')
            setCaptionLanguage('English')
            onClose()
            // Could trigger a toast or refresh here

        } catch (err: any) {
            setError(err.message || 'Failed to start bot')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md overflow-hidden p-0 gap-0 border-0 shadow-2xl rounded-2xl">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            {step === 'bot' && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 -ml-2 mr-1 rounded-full hover:bg-slate-100" onClick={() => setStep('selection')}>
                                    <ArrowLeft className="size-4" />
                                </Button>
                            )}
                            {step === 'selection' ? 'Start a Meeting' : 'Join with Bot'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            {step === 'selection'
                                ? 'Choose how you would like to join or start your meeting.'
                                : 'Enter the meeting URL for the Onix Bot to join.'}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-6 pt-2">
                    {step === 'selection' ? (
                        <div className="grid gap-3">
                            <button
                                onClick={handleExtensionClick}
                                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/50 hover:border-blue-200 hover:shadow-sm transition-all text-left group w-full"
                            >
                                <div className="size-12 shrink-0 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                                    <Video className="size-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">Browser Extension</h3>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Opens a new Google Meet tab. Requires the Onix extension installed.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setStep('bot')}
                                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/50 hover:border-blue-200 hover:shadow-sm transition-all text-left group w-full"
                            >
                                <div className="size-12 shrink-0 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                                    <Bot className="size-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">Onix Bot</h3>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Invite the AI bot to join an existing call.</p>
                                </div>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Meeting URL</label>
                                <Input
                                    placeholder="https://meet.google.com/..."
                                    value={meetingUrl}
                                    onChange={(e) => setMeetingUrl(e.target.value)}
                                    className="rounded-xl border-slate-200 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Meeting Title <span className="text-slate-400 font-normal">(Optional)</span></label>
                                <Input
                                    placeholder="e.g. Weekly Sync"
                                    value={meetingTitle}
                                    onChange={(e) => setMeetingTitle(e.target.value)}
                                    className="rounded-xl border-slate-200 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Caption Language</label>
                                <select
                                    value={captionLanguage}
                                    onChange={(e) => setCaptionLanguage(e.target.value)}
                                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                >
                                    {CAPTION_LANGUAGES.map((lang) => (
                                        <option key={lang} value={lang}>
                                            {lang}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {error && (
                                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                                    {error}
                                </div>
                            )}

                            <div className="pt-2">
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl shadow-lg shadow-blue-600/20"
                                    onClick={startMeetingBot}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <span className="flex items-center gap-2">
                                            <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Starting Bot...
                                        </span>
                                    ) : (
                                        <span>Summon Bot</span>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
