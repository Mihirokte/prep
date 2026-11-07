import * as React from 'react'
import { cn } from '../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Bootstrap form-control
        'h-[38px] w-full min-w-0 rounded-md border border-edge bg-paper px-3 py-1.5 font-sans text-[16px] leading-6 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-2 focus-visible:border-brand focus-visible:outline-none disabled:pointer-events-none disabled:bg-wash',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
