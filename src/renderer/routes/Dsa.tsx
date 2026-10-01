import { useState } from 'react'
import { Search } from 'lucide-react'
import { useModel } from '../model/context'
import { useAppSelector } from '../store'
import { ProblemRow } from '../components/ui'
import { NotFound, BackLink } from '../components/nav'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

/** One reusable filter dropdown — same shape for every facet. */
function Filter({
  value,
  onChange,
  label,
  options,
  className,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DsaList() {
  const area = useModel().areas.find((a) => a.key === 'dsa')
  const problems = useAppSelector((s) => s.progress.problems)
  const [q, setQ] = useState('')
  const [diff, setDiff] = useState('all')
  const [st, setSt] = useState('all')
  const [topic, setTopic] = useState('all')
  if (!area) return <NotFound />

  const topics = [...new Set(area.drills.map((d) => d.topic))].sort()
  const drills = area.drills.filter((d) => {
    const status = problems[d.id]?.status ?? 'none'
    if (diff !== 'all' && d.difficulty.toLowerCase() !== diff) return false
    if (st !== 'all' && status !== st) return false
    if (topic !== 'all' && d.topic !== topic) return false
    if (q && !(d.title + ' ' + d.topic).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-3xl">
      <BackLink href="#/">Home</BackLink>
      <h1>DSA</h1>

      <div className="mt-6 mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search problems"
          />
        </div>
        <Filter
          label="Topic"
          value={topic}
          onChange={setTopic}
          className="w-48"
          options={[
            { value: 'all', label: 'Any topic' },
            ...topics.map((t) => ({ value: t, label: t })),
          ]}
        />
        <Filter
          label="Difficulty"
          value={diff}
          onChange={setDiff}
          className="w-36"
          options={[
            { value: 'all', label: 'Any difficulty' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
        <Filter
          label="Status"
          value={st}
          onChange={setSt}
          className="w-36"
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'none', label: 'Untouched' },
            { value: 'attempted', label: 'Attempted' },
            { value: 'solved', label: 'Solved' },
            { value: 'revisit', label: 'Revisit' },
          ]}
        />
      </div>

      <div className="list panel">
        {drills.map((d) => (
          <ProblemRow key={d.id} drill={d} />
        ))}
        {drills.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No match.</p>}
      </div>
    </div>
  )
}
