import * as React from 'react'
import { cn } from '../lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'notch block min-h-24 w-full resize-y border border-hair-strong bg-surface px-4 py-3 font-sans text-[16px] leading-7 text-ink outline-none transition-colors placeholder:text-ink-2 hover:border-brand focus-visible:border-brand focus-visible:outline-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
