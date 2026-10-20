import { CalendarClock, CreditCard, Landmark, Timer } from 'lucide-react'
import { ActionMenu } from '../components/ActionMenu'
import { Modal } from '../components/Modal'
import { useMemo, useState } from 'react'
import { installmentAccounts } from '../lib/scheduled'
import { formatDate, formatMoney } from '../lib/format'
import { RecurringMovementsSection } from './RecurringMovementsSection'
import type { Account, AppData, Movement, RecurringMovement, ScheduledPayment, User } from '../types'

interface Props {
  data: AppData
  user: User
  onEdit: (movement: Movement) => void
  onDelete: (movementId: string) => void
  onChangeInstallmentAccount: (paymentId: string, accountId: string) => void
  personalOnly?: boolean
  onSaveRecurring: (movement: RecurringMovement) => void
  onDeleteRecurring: (id: string) => void
  onToggleRecurring: (id: string) => void
  onSkipRecurring: (id: string) => void
  onConfirmRecurring: (movement: RecurringMovement) => void
}

export function ScheduledPaymentsPage({ data, user, onEdit, onDelete, onChangeInstallmentAccount, personalOnly, onSaveRecurring, onDeleteRecurring, onToggleRecurring, onSkipRecurring, onConfirmRecurring }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = data.scheduledPayments.find((item) => item.id === editingId && item.authorId === user.id && item.status === 'scheduled')
  const groups = useMemo(() => {
    const visible = data.scheduledPayments.filter((item) => item.status === 'scheduled' && item.authorId === user.id)
    const grouped = new Map<string, ScheduledPayment[]>()
    for (const payment of visible) grouped.set(payment.planId, [...(grouped.get(payment.planId) ?? []), payment])
    return [...grouped.values()].map((items) => items.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))).toSorted((a, b) => a[0].dueDate.localeCompare(b[0].dueDate))
  }, [data.scheduledPayments, user.id])

  return <div className="page scheduled-page">
    <div className="page-heading"><div><h1>Ricorrenze e rate</h1><p>Movimenti ricorrenti da confermare e rate automatiche.</p></div></div>
    <RecurringMovementsSection data={data} user={user} personalOnly={personalOnly} onSave={onSaveRecurring} onDelete={onDeleteRecurring} onToggle={onToggleRecurring} onSkip={onSkipRecurring} onConfirm={onConfirmRecurring} />
    <section className="scheduled-section"><div className="section-title-row"><div><h2>Rate</h2><p>Le rate future vengono registrate automaticamente alla scadenza.</p></div></div>
    {!groups.length ? <div className="empty-state empty-state--compact"><CalendarClock /><h3>Nessuna rata in attesa</h3><p>I nuovi acquisti rateizzati compariranno qui.</p></div> : <div className="scheduled-list">{groups.map((payments) => {
      const first = payments[0]
      const account = data.accounts.find((item) => item.id === first.accountId)
      const differentAccounts = payments.some((payment) => payment.accountId !== first.accountId)
      const beneficiary = data.beneficiaries.find((item) => item.id === first.beneficiaryId)
      const firstMovement = data.movements.find((item) => item.installmentPlanId === first.planId && item.installmentNumber === 1 && item.authorId === user.id)
      const planTotal = (firstMovement?.amount ?? 0) + data.movements
        .filter((item) => item.installmentPlanId === first.planId && item.installmentNumber !== 1 && item.authorId === user.id)
        .reduce((sum, item) => sum + item.amount, 0) + payments.reduce((sum, item) => sum + item.amount, 0)
      const paidCount = first.installmentCount - payments.length
      return <section className="scheduled-plan" key={first.planId}>
        <header><span className="scheduled-plan__icon"><CalendarClock /></span><div><h2>{first.description}</h2><p>{beneficiary?.name ?? 'Nessun beneficiario'} · {first.provider ?? 'Pagamento rateale'}{firstMovement ? ` · iniziato il ${formatDate(firstMovement.date)}` : ''}</p></div><div className="scheduled-plan__total"><small>Importo totale</small><strong>{formatMoney(planTotal)}</strong></div>{firstMovement ? <div className="scheduled-plan__actions"><ActionMenu label={`Azioni per ${first.description}`} items={[{ label: 'Modifica', onSelect: () => onEdit(firstMovement) }, { label: 'Elimina', danger: true, onSelect: () => confirm('Eliminare questo acquisto e tutte le rate collegate?') && onDelete(firstMovement.id) }]} /></div> : null}</header>
        <div className="scheduled-plan__meta"><span><Landmark />{differentAccounts ? 'Conti diversi per le rate' : account?.name ?? 'Conto eliminato'}</span><span><Timer />{paidCount} di {first.installmentCount} pagate</span><span className={first.shared ? 'scope-label scope-label--shared' : 'scope-label'}>{first.shared ? 'Famiglia' : 'Personale'}</span></div>
        <div className="scheduled-installments">{payments.map((payment) => {
          const paymentAccount = data.accounts.find((item) => item.id === payment.accountId)
          return <article key={payment.id}><span className="scheduled-installments__number">{payment.installmentNumber}</span><div><strong>Rata {payment.installmentNumber} di {payment.installmentCount}</strong><small>Scadenza {formatDate(payment.dueDate)}</small><small className="scheduled-installments__account"><CreditCard />{paymentAccount?.name ?? 'Conto eliminato'}</small></div><span className="scheduled-installments__amount"><small>Rata completa</small><b>{formatMoney(payment.amount)}</b></span><ActionMenu label={`Azioni rata ${payment.installmentNumber} di ${payment.description}`} items={[{ label: 'Cambia conto', onSelect: () => setEditingId(payment.id) }]} /></article>
        })}</div>
      </section>
    })}</div>}</section>
    {editing ? <Modal title={`Cambia conto · rata ${editing.installmentNumber} di ${editing.installmentCount}`} onClose={() => setEditingId(null)}>
      <InstallmentAccountForm key={editing.id} payment={editing} accounts={installmentAccounts(data, editing, user.id)} onCancel={() => setEditingId(null)} onSave={(accountId) => { onChangeInstallmentAccount(editing.id, accountId); setEditingId(null) }} />
    </Modal> : null}
  </div>
}

function InstallmentAccountForm({ payment, accounts, onSave, onCancel }: { payment: ScheduledPayment; accounts: Account[]; onSave: (accountId: string) => void; onCancel: () => void }) {
  const [accountId, setAccountId] = useState(payment.accountId)
  const valid = accounts.some((account) => account.id === accountId)
  return <form className="installment-account-form" onSubmit={(event) => { event.preventDefault(); if (valid && accountId !== payment.accountId) onSave(accountId) }}>
    <p>{payment.description} · {formatMoney(payment.amount)} · scadenza {formatDate(payment.dueDate)}</p>
    <p>Il nuovo conto verrà utilizzato soltanto per questa rata. Le altre rate e i pagamenti già registrati restano invariati.</p>
    <label>Conto di addebito<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
      {!accounts.some((account) => account.id === payment.accountId) ? <option value={payment.accountId} disabled>Conto precedente non disponibile</option> : null}
      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ''}</option>)}
    </select></label>
    <small>Scegli un conto dello stesso ambito del precedente: personale o familiare. I conti Wellfare sono esclusi.</small>
    <small>La modifica riguarda la contabilità in sKey: aggiorna il metodo di pagamento anche presso l’intermediario, se necessario.</small>
    {!accounts.some((account) => account.id !== payment.accountId) ? <p role="status">Nessun altro conto compatibile disponibile.</p> : null}
    <div className="form-actions"><button type="button" className="button button--secondary" onClick={onCancel}>Annulla</button><button type="submit" className="button button--primary" disabled={!valid || accountId === payment.accountId}>Salva conto</button></div>
  </form>
}
