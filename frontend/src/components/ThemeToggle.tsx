import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Dark mode is a plain `.dark` class on <html> + shadcn's theme tokens.
// The initial class is set by an inline script in index.html (before React
// mounts, to avoid a flash of the wrong theme); this toggle just flips it and
// remembers the choice in localStorage.
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    setDark(next)
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}
