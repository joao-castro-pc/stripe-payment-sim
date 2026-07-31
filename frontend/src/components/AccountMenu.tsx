import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// First two letters of the email, for the avatar. (When AppUser gains a Name
// field this can switch to the name's initials.)
function initials(email: string) {
  return email.slice(0, 2).toUpperCase()
}

// The account control in the nav: a Sign in link when signed out, or a compact
// avatar button that opens a dropdown (email, admin link, sign out) when signed
// in. Replacing the old wide "Sign out" button is what stops the nav overflowing
// on mobile.
export function AccountMenu() {
  const { user, logout, isAdmin, isLoading } = useAuth()
  const navigate = useNavigate()

  if (isLoading) return null
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link to="/login">Sign in</Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {initials(user.email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground" title={user.email}>
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <LayoutDashboard className="size-4" />
            Admin dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={async () => { await logout(); navigate('/') }}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
