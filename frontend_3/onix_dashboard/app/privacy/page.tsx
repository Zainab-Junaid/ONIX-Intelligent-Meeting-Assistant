import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Privacy Policy | Onix",
  description: "Privacy policy for Onix Meeting Assistant and Onix Dashboard.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          <ArrowLeft className="size-4" />
          Back to Onix
        </Link>

        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
            <p className="text-slate-700 dark:text-slate-300">
              Onix Meeting Assistant (&quot;the Extension&quot;) and the Onix Dashboard (&quot;the Service&quot;) are provided to help you capture, transcribe, and manage meeting content from Google Meet and Zoom. This privacy policy describes what data we collect, how we use it, and your choices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Data We Collect</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">
              When you use the Extension and sign in, we may collect:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-slate-700 dark:text-slate-300">
              <li>
                <strong>Personally identifiable information:</strong> Name and email address (from Google sign-in) to authenticate you and associate your saved meetings and transcripts with your account.
              </li>
              <li>
                <strong>Personal communications / meeting content:</strong> Caption and transcript text from meetings you choose to capture. This is the spoken content that appears as captions in Google Meet or Zoom. We use it to save transcripts, generate summaries and notes, and provide Q&A about the meeting.
              </li>
              <li>
                <strong>Website content (text):</strong> We read only the on-screen caption text from the meeting tab (no images, video, or other page content). This text is sent to our servers to save your transcript and to generate summaries or notes when you request them.
              </li>
              <li>
                <strong>Meeting metadata:</strong> Meeting titles, URLs, and timestamps that you provide or we derive, so you can find and manage your saved meetings.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1 text-slate-700 dark:text-slate-300">
              <li>To save your transcripts and meeting records to your account.</li>
              <li>To generate summaries, notes, or answers to questions about your meetings when you use those features.</li>
              <li>To allow you to download transcripts or optional meeting recordings locally.</li>
              <li>To authenticate you and manage your account and preferences.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Where Data Is Stored</h2>
            <p className="text-slate-700 dark:text-slate-300">
              Transcripts and meeting data for signed-in users are stored in our backend (e.g. cloud databases such as Firestore) and associated with your account. If you use guest mode, transcript data may be kept only in the extension or on your device until you download or email it. We do not sell your personal data or meeting content to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Your Choices</h2>
            <p className="text-slate-700 dark:text-slate-300">
              You choose when to start and stop capture. We only read caption text from the meeting tab when you have started capture. You can sign out, delete your account or data (via account/settings where available), and use guest mode to avoid linking data to an account. You can uninstall the Extension at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Contact</h2>
            <p className="text-slate-700 dark:text-slate-300">
              For questions about this privacy policy or your data, contact us through the contact details provided in the Chrome Web Store listing or on the Onix Dashboard.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
