import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'
import { Slot } from 'radix-ui'

// Bootstrap 5.3 buttons: btn-primary, btn-outline-secondary, btn-outline-danger,
// btn-link. Disabled buttons keep full-opacity text (no faded text) and lose the fill.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-[16px] leading-6 font-normal no-underline outline-none transition-[color,background-color,border-color] duration-150 hover:no-underline disabled:pointer-events-none disabled:border-hair-strong disabled:bg-wash disabled:text-ink-2 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-fill bg-fill text-white hover:border-[var(--fill-hover)] hover:bg-[var(--fill-hover)]',
        outline: 'border-edge bg-transparent text-ink hover:bg-wash',
        secondary: 'border-edge bg-surface text-ink hover:bg-wash',
        destructive: 'border-danger bg-transparent text-danger hover:bg-wash',
        ghost: 'border-transparent bg-transparent text-ink hover:bg-wash',
        link: 'border-transparent bg-transparent px-0 text-brand underline hover:no-underline',
      },
      size: {
        default: 'h-[38px] px-3',
        xs: 'h-7 px-2 text-[14px] leading-5',
        sm: 'h-8 px-2.5 text-[14px] leading-5',
        lg: 'h-12 px-4',
        icon: 'size-10',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
