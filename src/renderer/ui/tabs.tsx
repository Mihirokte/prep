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
      className={cn('flex w-full flex-wrap items-end gap-x-1 gap-y-0 border-b border-hair-strong', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Bootstrap nav-tabs: the active tab joins the panel below it.
        '-mb-px inline-flex h-10 items-center gap-2 rounded-t-md border border-transparent px-4 text-[16px] leading-6 whitespace-nowrap text-brand outline-none transition-colors hover:border-hair hover:border-b-transparent data-[state=active]:border-hair-strong data-[state=active]:border-b-paper data-[state=active]:bg-paper data-[state=active]:text-ink disabled:pointer-events-none disabled:text-ink-2',
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
