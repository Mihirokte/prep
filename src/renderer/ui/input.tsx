import * as React from 'react'
import { cn } from '../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 border-0 border-b-2 border-ink bg-transparent px-1 py-2 font-sans text-[16px] leading-7 text-ink outline-none transition-colors placeholder:text-ink-2 hover:border-brand focus-visible:border-brand focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
