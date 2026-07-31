// Brand: the Mélange boutique wordmark. A gold hairline monogram (always shown,
// keeps the nav compact on mobile) beside the Fraunces serif wordmark (hidden on
// narrow screens). "Mélange" — a curated mix — is the store's identity.
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-md border border-gold/60 pt-px font-serif text-lg leading-none text-gold">
        M
      </span>
      <span className="hidden font-serif text-xl font-medium tracking-tight text-foreground sm:inline">
        Mélange
      </span>
    </span>
  )
}
