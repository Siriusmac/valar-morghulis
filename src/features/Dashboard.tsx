import { ArrowDownLeft, ArrowRight, CalendarDays, Check, Clock3, Landmark, ReceiptText, Scale, UserRound, WalletCards, X } from 'lucide-react'
import { useState } from 'react'
import { PERSONAL_WORKSPACE_ID, type FamilyOption } from './CloudAccess'
import { accountBalance, movementHasSharedPortion, sharedBalance, sharedExpensesByMember, sharedMovementAmount } from '../lib/calculations'
import { formatDate, formatMoney, formatMonthYear, selectableMonths, todayISO } from '../lib/format'
import type { AppData, User, PageId, Reimbursement } from '../types'

interface Props {
  data: AppData
  user: User
  members: User[]
  onNavigate: (page: PageId) => void
  onReimburse: () => void
  onRespondReimbursement?: (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  workspace?: {
    familyId: string
    families: FamilyOption[]
    personalMode: boolean
    onSwitch: (familyId: string) => Promise<void>
  }
}

export function Dashboard({ data, user, members, onNavigate, onReimburse, onRespondReimbursement, workspace }: Props) {
  const todayMonth = todayISO().slice(0, 7)
  const [monthlyChartView, setMonthlyChartView] = useState<'daily' | 'members'>('daily')
  const [selectedMonth, setSelectedMonth] = useState(() => todayMonth)
  const balance = sharedBalance(data, user.id, members.length)
  const other = members.find((item) => item.id !== user.id) ?? user
  const multipleOthers = members.length > 2
  const shared = data.movements.filter((item) => movementHasSharedPortion(data, item)).toSorted((a, b) => b.date.localeCompare(a.date))
  const ownAccounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const currentMonth = selectedMonth
  const monthOptions = selectableMonths(data.movements.map((movement) => movement.date), selectedMonth, todayMonth)
  const monthDate = new Date(`${currentMonth}-01T12:00:00`)
  const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(monthDate)
  const monthAndYear = formatMonthYear(todayMonth)
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
  const memberExpenseTotals = sharedExpensesByMember(data, members.map((member) => member.id), currentMonth)
  const memberExpenseMaximum = Math.max(...memberExpenseTotals.map((item) => item.total), 0)
  const membersMonthlyTotal = memberExpenseTotals.reduce((total, item) => total + item.total, 0)
  const reimbursementUpdates = data.reimbursements.filter((item) =>
    (item.status === 'pending' || item.status === 'rejected') && (item.fromId === user.id || item.toId === user.id))

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
          {balance !== 0 && (members.length <= 2 || balance < 0) ? <button className="text-button" onClick={onReimburse}>Registra rimborso <ArrowRight /></button> : null}
        </div>
        <div className="monthly-chart">
          <div className="monthly-chart__heading">
            <div className="section-title-row"><div><h2>Spese condivise del mese</h2><p>{formatMoney(monthlyTotal)} complessivi</p></div><span>{monthLabel}</span></div>
            <div className="monthly-chart__controls">
              <div className="monthly-chart__switch" role="group" aria-label="Visualizzazione del grafico mensile">
                <button type="button" aria-pressed={monthlyChartView === 'daily'} onClick={() => setMonthlyChartView('daily')}>Per giorno</button>
                <button type="button" aria-pressed={monthlyChartView === 'members'} onClick={() => setMonthlyChartView('members')}>Per persona</button>
              </div>
              <label className="month-field"><CalendarDays /><select aria-label="Mese del grafico condiviso" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{monthOptions.map((month) => <option key={month} value={month}>{formatMonthYear(month)}</option>)}</select></label>
            </div>
          </div>
          {monthlyChartView === 'daily' ? <>
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
          </> : <div className="member-spending-chart" aria-label={`Spese anticipate dai membri: ${formatMoney(membersMonthlyTotal)}`}>
            {memberExpenseTotals.map((item) => {
              const member = members.find((candidate) => candidate.id === item.memberId)
              const width = memberExpenseMaximum > 0 ? (item.total / memberExpenseMaximum) * 100 : 0
              return <div className={`member-spending-row ${item.memberId === user.id ? 'member-spending-row--current' : ''}`} key={item.memberId} role="img" aria-label={`${member?.name ?? 'Membro'}: ${formatMoney(item.total)}`}>
                <span className="member-spending-row__avatar">{member?.initials || member?.name.slice(0, 2).toUpperCase()}</span>
                <div><span><strong>{member?.name ?? 'Membro'}</strong>{item.memberId === user.id ? <small>Tu</small> : null}</span><i><b style={{ width: `${width}%` }} /></i></div>
                <strong>{formatMoney(item.total)}</strong>
              </div>
            })}
            {membersMonthlyTotal === 0 ? <p className="member-spending-chart__empty">Nessun membro ha anticipato spese condivise questo mese.</p> : null}
            <small className="member-spending-chart__note">Sono escluse le spese pagate direttamente con un conto condiviso.</small>
          </div>}
        </div>
      </section>}

      {!workspace?.personalMode ? <section className="dashboard-section">
        <div className="section-title-row"><div><h2>Ultimi movimenti condivisi</h2><p>Entrate e spese visibili a tutta la famiglia</p></div><button className="text-button" onClick={() => onNavigate('movements')}>Vedi tutti <ArrowRight /></button></div>
        <div className="expense-list expense-list--dashboard">
          {shared.slice(0, 4).map((movement) => {
            const category = data.categories.find((item) => item.id === movement.categoryId)
            const beneficiary = data.beneficiaries.find((item) => item.id === movement.beneficiaryId)
            const sender = data.senders.find((item) => item.id === movement.senderId)
            const member = members.find((item) => item.id === movement.memberId)
            const account = data.accounts.find((item) => item.id === movement.accountId)
            const displayedAmount = account?.scope === 'family' ? movement.amount : sharedMovementAmount(movement)
            return (
              <article className="expense-row" key={movement.id}>
                <span className="expense-row__icon" style={{ color: category?.color }}>{movement.type === 'income' ? <ArrowDownLeft /> : <ReceiptText />}</span>
                <div className="expense-row__name"><strong>{movement.description}</strong><small>{movement.splits?.length ? `${movement.splits.length + 1} categorie` : category?.name} · {movement.type === 'income' ? sender?.name ?? 'Nessun mittente' : beneficiary?.name ?? 'Nessun beneficiario'}</small></div>
                <div className="expense-row__payer"><small>{movement.type === 'income' ? 'Ricevuto da' : 'Pagato da'}</small><span>{member?.name}</span></div>
                <time>{formatDate(movement.date)}</time>
                <strong className={`expense-row__amount ${movement.type === 'income' ? 'positive-text' : ''}`} title="Quota condivisa">{movement.type === 'income' ? '+' : '−'}{formatMoney(displayedAmount)}</strong>
              </article>
            )
          })}
        </div>
      </section> : null}

      {!workspace?.personalMode && reimbursementUpdates.length ? <section className="dashboard-section">
        <div className="section-title-row"><div><h2>Rimborsi da verificare</h2><p>Un rimborso modifica i saldi soltanto dopo la conferma della controparte</p></div></div>
        <div className="reimbursement-review-list">
          {reimbursementUpdates.map((reimbursement) => <ReimbursementReview
            key={reimbursement.id}
            reimbursement={reimbursement}
            data={data}
            user={user}
            members={members}
            onRespond={onRespondReimbursement}
          />)}
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

export function ReimbursementReview({ reimbursement, data, user, members, onRespond }: {
  reimbursement: Reimbursement
  data: AppData
  user: User
  members: User[]
  onRespond?: Props['onRespondReimbursement']
}) {
  const isCounterparty = reimbursement.authorId !== user.id
  const ownsSource = reimbursement.fromId === user.id
  const ownPersonalAccounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === user.id)
  const selectableAccounts = ownsSource
    ? ownPersonalAccounts
    : [...ownPersonalAccounts, ...data.accounts.filter((account) => account.scope === 'family')]
  const existingAccountId = ownsSource ? reimbursement.fromAccountId : reimbursement.toAccountId
  const [selectedAccountId, setSelectedAccountId] = useState(existingAccountId ?? selectableAccounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const author = members.find((member) => member.id === reimbursement.authorId)
  const other = members.find((member) => member.id === (ownsSource ? reimbursement.toId : reimbursement.fromId))
  const respond = async (accepted: boolean) => {
    if (!onRespond || (accepted && !selectedAccountId)) return
    setBusy(true)
    await onRespond(reimbursement.id, accepted, accepted ? selectedAccountId || undefined : undefined)
    setBusy(false)
  }
  if (reimbursement.status === 'rejected') return <article className="reimbursement-review reimbursement-review--rejected">
    <span><X /></span><div><strong>Rimborso rifiutato</strong><small>{formatMoney(reimbursement.amount)} · registrato da {author?.name ?? 'un membro'}</small></div>
  </article>
  if (!isCounterparty) return <article className="reimbursement-review">
    <span><Clock3 /></span><div><strong>In attesa di {other?.name ?? 'conferma'}</strong><small>{formatMoney(reimbursement.amount)} · non ancora incluso nei saldi</small></div>
  </article>
  return <article className="reimbursement-review reimbursement-review--action">
    <span><Scale /></span>
    <div><strong>{author?.name ?? 'Un membro'} ha registrato un rimborso di {formatMoney(reimbursement.amount)}</strong><small>Verifica il conto che ti appartiene prima di confermare.</small>
      <label>{ownsSource ? 'Il tuo conto di origine' : 'Il tuo conto di destinazione'}<select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
        <option value="">Seleziona un conto</option>
        {selectableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.scope === 'family' ? ' · Condiviso' : ''}</option>)}
      </select></label>
    </div>
    <div className="reimbursement-review__actions">
      <button type="button" className="button button--ghost" disabled={busy} onClick={() => void respond(false)}><X /> Rifiuta</button>
      <button type="button" className="button button--primary" disabled={busy || !selectedAccountId} onClick={() => void respond(true)}><Check /> Conferma</button>
    </div>
  </article>
}
