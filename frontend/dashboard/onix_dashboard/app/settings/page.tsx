import { AppShell } from "@/components/app-shell"
import SettingsForm from "@/components/settings-form"

export default function Page() {
  return (
    <AppShell title="Settings" subtitle="Manage account and preferences">
      <SettingsForm />
    </AppShell>
  )
}
