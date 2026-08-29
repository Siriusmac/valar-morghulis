import { CalendarClock, CreditCard, Edit3, Landmark, Timer, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { formatDate, formatMoney } from '../lib/format'
import type { AppData, Movement, ScheduledPayment, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (movement: Movement) => void
  onDelete: (movementId: string) => void
}

export function ScheduledPaymentsPage({ data, user, onEdit, onDelete }: Props) {
  const groups = useMemo(() => {
    const visible = data.scheduledPayments.filter((item) => item.status === 'scheduled' && item.authorId === user.id)
    const grouped = new Map<string, ScheduledPayment[]>()
    for (const payment of visible) grouped.set(payment.planId, [...(grouped.get(payment.planId) ?? []), payment])
    return [...grouped.values()].map((items) => items.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))).toSorted((a, b) => a[0].dueDate.localeCompare(b[0].dueDate))
  }, [data.scheduledPayments, user.id])

  return <div className="page scheduled-page">
    <div className="page-heading"><div><h1>Pagamenti programmati</h1><p>Le rate future verranno registrate automaticamente alla scadenza.</p></div></div>
    {!groups.length ? <div className="empty-state"><CalendarClock /><h3>Nessuna rata in attesa</h3><p>I nuovi acquisti rateizzati compariranno qui.</p></div> : <div className="scheduled-list">{groups.map((payments) => {
      const first = payments[0]
      const account = data.accounts.find((item) => item.id === first.accountId)
      const beneficiary = data.beneficiaries.find((item) => item.id === first.beneficiaryId)
      const firstMovement = data.movements.find((item) => item.installmentPlanId === first.planId && item.installmentNumber === 1 && item.authorId === user.id)
      const pendingTotal = payments.reduce((sum, item) => sum + item.amount, 0)
      const paidCount = first.installmentCount - payments.length
      return <section className="scheduled-plan" key={first.planId}>
        <header><span className="scheduled-plan__icon"><CalendarClock /></span><div><h2>{first.description}</h2><p>{beneficiary?.name ?? 'Nessun beneficiario'} · {first.provider ?? 'Pagamento rateale'}{firstMovement ? ` · iniziato il ${formatDate(firstMovement.date)}` : ''}</p></div><div className="scheduled-plan__total"><small>Ancora da pagare</small><strong>{formatMoney(pendingTotal)}</strong></div>{firstMovement ? <div className="scheduled-plan__actions"><button className="icon-button" type="button" title="Modifica piano rateale" aria-label={`Modifica ${first.description}`} onClick={() => onEdit(firstMovement)}><Edit3 /></button><button className="icon-button icon-button--danger" type="button" title="Elimina piano rateale" aria-label={`Elimina ${first.description}`} onClick={() => confirm('Eliminare questo acquisto e tutte le rate collegate?') && onDelete(firstMovement.id)}><Trash2 /></button></div> : null}</header>
        <div className="scheduled-plan__meta"><span><Landmark />{account?.name}</span><span><Timer />{paidCount} di {first.installmentCount} pagate</span><span className={first.shared ? 'scope-label scope-label--shared' : 'scope-label'}>{first.shared ? 'Famiglia' : 'Personale'}</span></div>
        <div className="scheduled-installments">{payments.map((payment) => <article key={payment.id}><span className="scheduled-installments__number">{payment.installmentNumber}</span><div><strong>Rata {payment.installmentNumber} di {payment.installmentCount}</strong><small>Scadenza {formatDate(payment.dueDate)}</small></div><span><CreditCard />{account?.name}</span><span className="scheduled-installments__amount"><small>Rata completa</small><b>{formatMoney(payment.amount)}</b></span></article>)}</div>
      </section>
    })}</div>}
  </div>
}
