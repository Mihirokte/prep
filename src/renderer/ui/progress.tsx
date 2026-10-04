import * as React from 'react'
import { cn } from '../lib/utils'
import { Progress as ProgressPrimitive } from 'radix-ui'

// A pixel bar: a hairline track with ink fill that advances in whole 4px cells.
function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('relative h-2 w-full overflow-hidden border border-hair-strong bg-transparent', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full bg-ink transition-[width] duration-500 ease-[var(--ease)]"
        style={{ width: `${value || 0}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
