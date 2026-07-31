import { useAuth } from '@/auth/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// The signed-in user's own account details (route /account, any signed-in user).
// Read-only for now — editing the name is a future task.
export default function AccountPage() {
  const { user } = useAuth()
  // RequireAuth wraps this route, so user is present; guard defensively anyway.
  if (!user) return null

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">My account</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{user.name?.trim() || '—'}</Field>
          <Field label="Email">{user.email}</Field>
          <Field label="Role">{user.role}</Field>
        </CardContent>
      </Card>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all text-foreground">{children}</dd>
    </div>
  )
}
