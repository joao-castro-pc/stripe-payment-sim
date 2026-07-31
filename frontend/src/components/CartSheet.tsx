import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/cart/CartContext'
import { useCurrency } from '@/currency/CurrencyContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export function CartSheet() {
  const { items, count, total, setQty, remove, open, setOpen } = useCart()
  const { format } = useCurrency()
  const navigate = useNavigate()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* asChild: render OUR button as the trigger instead of the default one. */}
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <ShoppingCart className="size-4" />
          <span className="hidden sm:inline">Cart</span>
          {count > 0 && (
            <Badge key={count} className="ml-1 animate-badge-pop rounded-full px-1.5">{count}</Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">Your cart is empty.</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-4">
            {items.map((i) => (
              <div key={i.product.id} className="flex gap-3 border-b py-3 last:border-0">
                <img
                  src={i.product.thumbnail}
                  alt=""
                  className="size-14 rounded-md border bg-white object-contain p-1"
                />
                <div className="flex flex-1 flex-col">
                  <span className="line-clamp-1 text-sm font-medium">{i.product.title}</span>
                  <span className="text-xs text-muted-foreground">{format(i.product.price)} each</span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="size-8" onClick={() => setQty(i.product.id, i.qty - 1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{i.qty}</span>
                    <Button variant="outline" size="icon" className="size-8" onClick={() => setQty(i.product.id, i.qty + 1)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Price + remove share a right-aligned column so the trash icon
                    lines up across rows regardless of the price string width. */}
                <div className="flex flex-col items-end justify-between">
                  <span className="text-sm font-semibold tabular-nums">
                    {format(i.product.price * i.qty)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(i.product.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <SheetFooter className="mt-auto gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{format(total)}</span>
          </div>
          {/* SheetClose closes the drawer; then we navigate to the checkout page. */}
          <SheetClose asChild>
            <Button
              className="w-full"
              disabled={items.length === 0}
              onClick={() => navigate('/checkout')}
            >
              Checkout
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
