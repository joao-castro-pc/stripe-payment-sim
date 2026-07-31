import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import type { AuthUser } from '@/auth/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Avatar initials: the name's initials when we have one (first + last), else the
// first two letters of the email.
function initials(user: AuthUser) {
  const source = user.name?.trim() || user.email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
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
          {initials(user)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          {user.name?.trim() && <div className="truncate text-foreground">{user.name}</div>}
          <div className="truncate text-xs font-normal text-muted-foreground" title={user.email}>{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <UserRound className="size-4" />
          My account
        </DropdownMenuItem>
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
