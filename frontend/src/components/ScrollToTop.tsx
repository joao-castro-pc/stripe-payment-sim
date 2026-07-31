import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

// A floating "back to top" button that appears once the page is scrolled down.
// Handy on the long product grid (especially on mobile).
export function ScrollToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll() // set initial state (e.g. when landing already scrolled)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-5 right-5 z-40 grid size-11 place-items-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ArrowUp className="size-5" />
    </button>
  )
}
