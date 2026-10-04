import * as React from 'react'
import { cn } from '../lib/utils'
import { Tabs as TabsPrimitive } from 'radix-ui'

function Tabs({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn('flex gap-6 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex w-full flex-wrap items-end gap-x-6 gap-y-0 border-b border-hair', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        '-mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-0 font-label text-[12px] leading-5 uppercase tracking-[0.12em] whitespace-nowrap text-ink-2 outline-none transition-colors hover:text-brand data-[state=active]:border-ink data-[state=active]:text-ink disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
