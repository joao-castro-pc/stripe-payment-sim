import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '@/cart/CartContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function CartSheet() {
  const { items, count, total, setQty, remove } = useCart()

  return (
    <Sheet>
      {/* asChild: render OUR button as the trigger instead of the default one. */}
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <ShoppingCart className="size-4" />
          Cart
          {count > 0 && (
            <Badge className="ml-1 rounded-full px-1.5">{count}</Badge>
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
                  <span className="text-xs text-muted-foreground">{usd.format(i.product.price)} each</span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="size-6" onClick={() => setQty(i.product.id, i.qty - 1)}>
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{i.qty}</span>
                    <Button variant="outline" size="icon" className="size-6" onClick={() => setQty(i.product.id, i.qty + 1)}>
                      <Plus className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-6 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(i.product.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {usd.format(i.product.price * i.qty)}
                </span>
              </div>
            ))}
          </div>
        )}

        <SheetFooter className="mt-auto gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{usd.format(total)}</span>
          </div>
          <Button
            className="w-full"
            disabled={items.length === 0}
            // Wired up in the next increment (cart total -> POST /orders -> Stripe).
            onClick={() => toast.info('Checkout arrives in the next step')}
          >
            Checkout
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
