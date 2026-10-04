import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'
import { Slot } from 'radix-ui'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap px-2 font-label text-[12px] leading-5 uppercase tracking-[0.12em] [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-ink text-paper',
        secondary: 'border border-hair-strong text-ink-2',
        destructive: 'bg-brand text-paper',
        outline: 'border border-hair-strong text-ink-2',
        ghost: 'text-ink-2',
        link: 'text-ink underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
