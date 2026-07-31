import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// The signed-in user's own account details (route /account, any signed-in user).
// The name is editable inline; email and role are read-only.
export default function AccountPage() {
  const { user, updateProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // RequireAuth wraps this route, so user is present; guard defensively anyway.
  if (!user) return null

  const startEdit = () => {
    setName(user.name ?? '')
    setEditing(true)
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('A name is required.')
      return
    }
    setSaving(true)
    try {
      await updateProfile(trimmed)
      toast.success('Name updated')
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update your name.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">My account</h1>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Details</CardTitle>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Name</dt>
            {editing ? (
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  autoFocus
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  placeholder="Your name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <dd className="mt-0.5 break-all text-foreground">{user.name?.trim() || '—'}</dd>
            )}
          </div>
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
