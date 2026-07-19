import { formatMoney } from '../lib/format'
import type { Category } from '../types'

export interface DonutDatum {
  category?: Category
  total: number
}

interface Props {
  title: string
  data: DonutDatum[]
  tone: 'expense' | 'income'
  compact?: boolean
}

export function DonutChart({ title, data, tone, compact = false }: Props) {
  const total = data.reduce((sum, item) => sum + item.total, 0)
  let cursor = 0
  const fallback = tone === 'expense' ? '#c64e2f' : '#3f7650'
  const segments = data.map((item, index) => {
    const start = total ? (cursor / total) * 100 : 0
    cursor += item.total
    const end = total ? (cursor / total) * 100 : 0
    return `${item.category?.color ?? fallback} ${start}% ${end}%${index === data.length - 1 ? '' : ','}`
  }).join(' ')

  return (
    <section className={`donut-section ${compact ? 'donut-section--compact' : ''}`}>
      <h2>{title}</h2>
      <div className="donut-layout">
        <div className={`donut donut--${tone}`} style={{ background: total ? `conic-gradient(${segments})` : undefined }}>
          <div><small>Totale</small><strong>{formatMoney(total)}</strong></div>
        </div>
        <div className="donut-legend">
          {data.length ? data.map((item) => (
            <div key={item.category?.id ?? item.total}>
              <i style={{ background: item.category?.color ?? fallback }} />
              <span>{item.category?.name ?? 'Senza categoria'}</span>
              <strong>{formatMoney(item.total)}</strong>
              <small>{total ? `${Math.round((item.total / total) * 100)}%` : '0%'}</small>
            </div>
          )) : <p>Nessun movimento in questo mese.</p>}
        </div>
      </div>
    </section>
  )
}
