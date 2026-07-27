import { ArrowDownLeft, ArrowRight, Landmark, ReceiptText, Scale, UserRound, WalletCards } from 'lucide-react'
import { PERSONAL_WORKSPACE_ID, type FamilyOption } from './CloudAccess'
import { accountBalance, movementHasSharedPortion, sharedBalance, sharedMovementAmount } from '../lib/calculations'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import type { AppData, User, PageId } from '../types'

interface Props {
  data: AppData
  user: User
  members: User[]
  onNavigate: (page: PageId) => void
  onReimburse: () => void
  workspace?: {
    familyId: string
    families: FamilyOption[]
    personalMode: boolean
    onSwitch: (familyId: string) => Promise<void>
  }
}

export function Dashboard({ data, user, members, onNavigate, onReimburse, workspace }: Props) {
  const balance = sharedBalance(data, user.id, members.length)
  const other = members.find((item) => item.id !== user.id) ?? user
  const multipleOthers = members.length > 2
  const shared = data.movements.filter((item) => movementHasSharedPortion(data, item)).toSorted((a, b) => b.date.localeCompare(a.date))
  const ownAccounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const today = todayISO()
  const currentMonth = today.slice(0, 7)
  const monthDate = new Date(`${currentMonth}-01T12:00:00`)
  const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(monthDate)
  const monthAndYear = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(monthDate)
  const daysInMonth = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0).getDate()
  const dailyTotals = Array.from({ length: daysInMonth }, () => 0)
  for (const movement of shared) {
    if (movement.type !== 'expense' || !movement.date.startsWith(currentMonth)) continue
    const account = data.accounts.find((item) => item.id === movement.accountId)
    const amount = account?.scope === 'family' ? movement.amount : sharedMovementAmount(movement)
    dailyTotals[Number(movement.date.slice(8, 10)) - 1] += amount
  }
  const monthlyTotal = dailyTotals.reduce((total, amount) => total + amount, 0)
  const dailyMaximum = Math.max(...dailyTotals)

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div><h1>Ciao, {user.name}</h1><p>{workspace?.personalMode ? 'Qui trovi la tua contabilità personale.' : 'Qui trovi il punto della situazione familiare.'}</p></div>
        <div className="dashboard-heading-actions">
          {workspace && workspace.families.length ? <label className="dashboard-family-selector">
            <span>Vista condivisa</span>
            <select value={workspace.familyId} onChange={(event) => void workspace.onSwitch(event.target.value)}>
              <option value={PERSONAL_WORKSPACE_ID}>Solo personale</option>
              {workspace.families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
            </select>
          </label> : null}
          <p className="date-caption">{monthAndYear}</p>
        </div>
      </div>

      {workspace?.personalMode ? <section className="personal-workspace-card">
        <span><UserRound /></span><div><h2>Contabilità personale</h2><p>I movimenti di questa vista sono privati. Seleziona una famiglia qui sopra quando vuoi consultare saldi e spese condivise.</p></div>
      </section> : <section className="balance-zone">
        <div className="balance-summary">
          <span className={`balance-summary__icon ${balance >= 0 ? 'balance-summary__icon--positive' : ''}`}><Scale /></span>
          <div>
            <p>{balance < 0 ? (multipleOthers ? 'Devi alla famiglia' : `Devi a ${other.name}`) : balance > 0 ? (multipleOthers ? 'La famiglia deve a te' : `${other.name} deve a te`) : 'Siete in pari'}</p>
            <strong className={balance > 0 ? 'positive-text' : ''}>{formatMoney(Math.abs(balance))}</strong>
            <small>Il saldo si aggiorna automaticamente</small>
          </div>
          {balance !== 0 ? <button className="text-button" onClick={onReimburse}>Registra rimborso <ArrowRight /></button> : null}
        </div>
        <div className="monthly-chart">
          <div className="section-title-row"><div><h2>Spese condivise giornaliere</h2><p>{formatMoney(monthlyTotal)} nel mese in corso</p></div><span>{monthLabel}</span></div>
          <div className="bar-chart" aria-label={`Spese condivise del mese: ${formatMoney(monthlyTotal)}`}>
            {dailyTotals.map((amount, index) => (
              <i
                key={index}
                role="img"
                aria-label={`${String(index + 1).padStart(2, '0')} ${monthLabel}: ${formatMoney(amount)}`}
                title={`${String(index + 1).padStart(2, '0')} ${monthLabel} · ${formatMoney(amount)}`}
                className={amount > 0 ? 'bar-chart__day bar-chart__day--active' : 'bar-chart__day'}
                style={{ height: amount > 0 ? `${Math.max(5, (amount / dailyMaximum) * 100)}%` : '2px' }}
              />
            ))}
            {monthlyTotal === 0 ? <p className="bar-chart__empty">Nessuna spesa condivisa registrata questo mese.</p> : null}
          </div>
          <div className="chart-axis"><span>01</span><span>08</span><span>15</span><span>22</span><span>{daysInMonth}</span></div>
        </div>
      </section>}

      {!workspace?.personalMode ? <section className="dashboard-section">
        <div className="section-title-row"><div><h2>Ultimi movimenti condivisi</h2><p>Entrate e spese visibili a tutta la famiglia</p></div><button className="text-button" onClick={() => onNavigate('movements')}>Vedi tutti <ArrowRight /></button></div>
        <div className="expense-list expense-list--dashboard">
          {shared.slice(0, 4).map((movement) => {
            const category = data.categories.find((item) => item.id === movement.categoryId)
            const beneficiary = data.beneficiaries.find((item) => item.id === movement.beneficiaryId)
            const member = members.find((item) => item.id === movement.memberId)
            const account = data.accounts.find((item) => item.id === movement.accountId)
            const displayedAmount = account?.scope === 'family' ? movement.amount : sharedMovementAmount(movement)
            return (
              <article className="expense-row" key={movement.id}>
                <span className="expense-row__icon" style={{ color: category?.color }}>{movement.type === 'income' ? <ArrowDownLeft /> : <ReceiptText />}</span>
                <div className="expense-row__name"><strong>{movement.description}</strong><small>{movement.splits?.length ? `${movement.splits.length + 1} categorie` : category?.name} · {beneficiary?.name}</small></div>
                <div className="expense-row__payer"><small>{movement.type === 'income' ? 'Ricevuto da' : 'Pagato da'}</small><span>{member?.name}</span></div>
                <time>{formatDate(movement.date)}</time>
                <strong className={`expense-row__amount ${movement.type === 'income' ? 'positive-text' : ''}`} title="Quota condivisa">{movement.type === 'income' ? '+' : '−'}{formatMoney(displayedAmount)}</strong>
              </article>
            )
          })}
        </div>
      </section> : null}

      <section className="dashboard-section">
        <div className="section-title-row"><div><h2>I tuoi conti</h2><p>Il saldo include tutti i movimenti</p></div><button className="text-button" onClick={() => onNavigate('accounts')}>Gestisci <ArrowRight /></button></div>
        <div className="account-rail">
          {ownAccounts.map((account) => (
            <article key={account.id}>
              <span>{account.type === 'bank' ? <Landmark /> : <WalletCards />}</span>
              <div><strong>{account.name}</strong><small>{account.institution}</small></div>
              <b className={accountBalance(data, account.id) < 0 ? 'negative-text' : ''}>{formatMoney(accountBalance(data, account.id))}</b>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
