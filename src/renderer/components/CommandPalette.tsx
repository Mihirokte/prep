import { useMemo } from 'react'
import type { Model } from '../model/buildModel'
import { useModel } from '../model/context'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'

// Global search. Every record in the store is one entry; ⌘K is handled by the
// App shell, which owns the open state (the sidebar and toolbar open it too).

interface Entry {
  id: string
  label: string
  group: string
  href: string
}

function buildIndex(m: Model): Entry[] {
  const out: Entry[] = []
  for (const a of m.homeAreas) out.push({ id: `a-${a.key}`, label: a.label, group: 'Areas', href: a.href })
  for (const c of m.courses)
    for (const ch of c.chapters)
      for (const l of ch.lessons)
        out.push({ id: `l-${l.id}`, label: l.title, group: c.label, href: `#/study/${c.key}/${l.id}` })
  for (const a of m.areas)
    for (const d of a.drills)
      out.push({ id: `d-${d.id}`, label: d.title, group: `${a.label} problems`, href: `#/drill/${d.id}` })
  for (const co of m.companies)
    out.push({ id: `c-${co.key}`, label: co.name, group: 'Companies', href: `#/company/${co.key}` })
  for (const pat of m.patterns)
    out.push({ id: `p-${pat.key}`, label: pat.name, group: 'Patterns', href: `#/pattern/${pat.key}` })
  return out
}

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useModel()
  const index = useMemo(() => buildIndex(m), [m])

  // group entries, keeping Areas first
  const groups = useMemo(() => {
    const byGroup = new Map<string, Entry[]>()
    for (const e of index) {
      if (!byGroup.has(e.group)) byGroup.set(e.group, [])
      byGroup.get(e.group)!.push(e)
    }
    return [...byGroup.entries()].sort(([a], [b]) => (a === 'Areas' ? -1 : b === 'Areas' ? 1 : 0))
  }, [index])

  const go = (href: string) => {
    window.location.hash = href.replace(/^#/, '')
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to anything" showCloseButton={false}>
      <CommandInput placeholder="Search…" />
      <CommandList className="max-h-[56vh] p-1">
        <CommandEmpty>No match.</CommandEmpty>
        {groups.map(([group, entries]) => (
          <CommandGroup key={group} heading={group}>
            {entries.map((e) => (
              <CommandItem key={e.id} value={`${e.label} ${e.group}`} onSelect={() => go(e.href)}>
                <span className="flex-1 truncate">{e.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
