import * as React from 'react'
import { cn } from '../lib/utils'
import { Dialog as DialogPrimitive } from 'radix-ui'

// The modal in the house style: a notched 2px-ink frame with a hard offset
// shadow that grows out of the point that opened it (0.5s), closes in 0.34s,
// scrolls inside, and becomes a bottom sheet under 820px. The origin comes
// from the last pointer-down, written to --ox/--oy by the app shell.

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}
function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}
function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

/** Offset of the opening point from the viewport centre, for the grow animation. */
function originStyle(): React.CSSProperties {
  const root = document.documentElement
  const ox = parseFloat(root.style.getPropertyValue('--ox')) || window.innerWidth / 2
  const oy = parseFloat(root.style.getPropertyValue('--oy')) || window.innerHeight * 0.3
  return {
    ['--dx' as string]: `${Math.round(ox - window.innerWidth / 2)}px`,
    ['--dy' as string]: `${Math.round(oy - window.innerHeight / 2)}px`,
  }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  top,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean; top?: boolean }) {
  const style = React.useMemo(originStyle, [])
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        style={style}
        className={cn(
          'modal-pop fixed inset-x-0 z-50 mx-auto h-fit w-[calc(100%-2rem)] max-w-[560px] outline-none max-[820px]:inset-x-0 max-[820px]:bottom-0 max-[820px]:top-auto max-[820px]:mx-0 max-[820px]:w-full max-[820px]:max-w-none',
          top ? 'top-[12vh]' : 'inset-y-0 my-auto',
        )}
        {...props}
      >
        <div className="cast">
          <div className={cn('panel relative flex max-h-[74vh] flex-col overflow-hidden', className)}>
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot="dialog-close"
                className="absolute top-4 right-4 font-label text-[12px] uppercase tracking-[0.12em] text-ink-2 outline-none transition-colors hover:text-brand"
              >
                Esc
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1 px-7 pt-7', className)} {...props} />
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex justify-end gap-3 px-7 pb-7', className)} {...props} />
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('font-display text-[28px] leading-none', className)} {...props} />
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-ink-2', className)} {...props} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
