import * as React from 'react'
import { cn } from '../lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Bootstrap form-control
        'block min-h-24 w-full resize-y rounded-md border border-edge bg-paper px-3 py-2 font-sans text-[16px] leading-6 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-2 focus-visible:border-brand focus-visible:outline-none disabled:bg-wash',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
