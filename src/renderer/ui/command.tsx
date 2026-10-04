import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from '../lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive data-slot="command" className={cn('flex h-full w-full flex-col overflow-hidden text-ink', className)} {...props} />
}

function CommandDialog({
  title = 'Search',
  description = 'Jump to anything',
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & { title?: string; description?: string; className?: string; showCloseButton?: boolean }) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent top className={cn('p-0', className)} showCloseButton={showCloseButton}>
        <Command
          className={cn(
            '[&_[cmdk-group-heading]]:px-7 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-label [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-2',
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex h-16 items-center gap-3 border-b-2 border-ink px-7 pr-16">
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn('h-full w-full bg-transparent font-sans text-[16px] outline-none placeholder:text-ink-2 disabled:opacity-50', className)}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List data-slot="command-list" className={cn('max-h-[56vh] overflow-y-auto overflow-x-hidden pb-3', className)} {...props} />
}
function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className="px-7 py-8 text-ink-2" {...props} />
}
function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn('overflow-hidden', className)} {...props} />
}
function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn('h-px bg-hair', className)} {...props} />
}
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex min-h-11 cursor-default items-center gap-3 px-7 py-2 text-[16px] outline-none select-none data-[selected=true]:bg-[var(--wash)] data-[selected=true]:text-brand data-[selected=true]:before:absolute data-[selected=true]:before:left-0 data-[selected=true]:before:top-0 data-[selected=true]:before:h-full data-[selected=true]:before:w-[2px] data-[selected=true]:before:bg-brand data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="command-shortcut" className={cn('ml-auto font-label text-[12px] tracking-[0.12em] text-ink-2', className)} {...props} />
}

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator }
