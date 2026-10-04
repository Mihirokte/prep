import * as React from 'react'
import { cn } from '../lib/utils'
import { Accordion as AccordionPrimitive } from 'radix-ui'

function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('border-b border-hair last:border-b-0', className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex flex-1 items-center justify-between gap-4 px-4 py-4 text-left font-label text-[12px] leading-5 uppercase tracking-[0.12em] text-ink outline-none transition-colors hover:text-brand disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
        <span className="shrink-0 text-ink-2 group-hover:text-brand">
          <span className="group-data-[state=open]:hidden">open</span>
          <span className="hidden group-data-[state=open]:inline">close</span>
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn('px-4 pt-1 pb-6', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
