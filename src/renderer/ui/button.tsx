import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'
import { Slot } from 'radix-ui'

// Buttons are Determination caps labels. The filled button is ink on paper and
// turns accent on hover; everything else is a frame or plain text.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-label text-[12px] leading-5 uppercase tracking-[0.12em] no-underline outline-none transition-[color,background-color,border-color] duration-150 ease-[var(--ease)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'notch bg-ink text-paper hover:bg-brand hover:text-paper',
        outline: 'notch border-2 border-ink bg-transparent text-ink hover:border-brand hover:text-brand',
        secondary: 'notch border border-edge bg-transparent text-ink hover:border-brand hover:text-brand',
        destructive: 'notch border-2 border-ink bg-transparent text-ink hover:bg-brand hover:border-brand hover:text-paper',
        ghost: 'text-muted-foreground hover:text-brand',
        link: 'text-ink underline underline-offset-[5px] decoration-edge hover:text-brand hover:decoration-brand',
      },
      size: {
        default: 'h-10 px-5',
        xs: 'h-6 px-2',
        sm: 'h-8 px-3',
        lg: 'h-12 px-6',
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
