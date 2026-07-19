import { ArrowDownLeft, ArrowRight, Landmark, ReceiptText, Scale, WalletCards } from 'lucide-react'
import { accountBalance, sharedBalance } from '../lib/calculations'
import { formatDate, formatMoney } from '../lib/format'
import { users } from '../lib/seed'
import type { AppData, User, PageId } from '../types'

interface Props {
  data: AppData
  user: User
  onNavigate: (page: PageId) => void
  onReimburse: () => void
}

export function Dashboard({ data, user, onNavigate, onReimburse }: Props) {
  const balance = sharedBalance(data, user.id)
  const other = users.find((item) => item.id !== user.id)!
  const sharedAccountIds = new Set(data.accounts.filter((item) => item.scope === 'family').map((item) => item.id))
  const shared = data.movements.filter((item) => item.shared || sharedAccountIds.has(item.accountId)).toSorted((a, b) => b.date.localeCompare(a.date))
  const ownAccounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const monthlyTotal = shared.filter((item) => item.type === 'expense').reduce((total, item) => total + item.amount, 0)
  const bars = [18, 32, 24, 45, 68, 38, 82, 54, 92, 42, 31, 62, 35, 73, 47, 28, 56, 39]

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div><h1>Ciao, {user.name}</h1><p>Qui trovi il punto della situazione familiare.</p></div>
        <p className="date-caption">Luglio 2026</p>
      </div>

      <section className="balance-zone">
        <div className="balance-summary">
          <span className={`balance-summary__icon ${balance >= 0 ? 'balance-summary__icon--positive' : ''}`}><Scale /></span>
          <div>
            <p>{balance < 0 ? `Devi a ${other.name}` : balance > 0 ? `${other.name} deve a te` : 'Siete in pari'}</p>
            <strong className={balance > 0 ? 'positive-text' : ''}>{formatMoney(Math.abs(balance))}</strong>
            <small>Il saldo si aggiorna automaticamente</small>
          </div>
          {balance !== 0 ? <button className="text-button" onClick={onReimburse}>Registra rimborso <ArrowRight /></button> : null}
        </div>
        <div className="monthly-chart">
          <div className="section-title-row"><div><h2>Riepilogo condiviso</h2><p>{formatMoney(monthlyTotal)} questo mese</p></div><span>luglio</span></div>
          <div className="bar-chart" aria-label={`Spese condivise del mese: ${formatMoney(monthlyTotal)}`}>
            {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          </div>
          <div className="chart-axis"><span>01</span><span>08</span><span>15</span><span>22</span><span>29</span></div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-title-row"><div><h2>Ultimi movimenti condivisi</h2><p>Entrate e spese visibili a entrambi</p></div><button className="text-button" onClick={() => onNavigate('movements')}>Vedi tutti <ArrowRight /></button></div>
        <div className="expense-list expense-list--dashboard">
          {shared.slice(0, 4).map((movement) => {
            const category = data.categories.find((item) => item.id === movement.categoryId)
            const beneficiary = data.beneficiaries.find((item) => item.id === movement.beneficiaryId)
            const member = users.find((item) => item.id === movement.memberId)
            return (
              <article className="expense-row" key={movement.id}>
                <span className="expense-row__icon" style={{ color: category?.color }}>{movement.type === 'income' ? <ArrowDownLeft /> : <ReceiptText />}</span>
                <div className="expense-row__name"><strong>{movement.description}</strong><small>{category?.name} · {beneficiary?.name}</small></div>
                <div className="expense-row__payer"><small>{movement.type === 'income' ? 'Ricevuto da' : 'Pagato da'}</small><span>{member?.name}</span></div>
                <time>{formatDate(movement.date)}</time>
                <strong className={`expense-row__amount ${movement.type === 'income' ? 'positive-text' : ''}`}>{movement.type === 'income' ? '+' : '−'}{formatMoney(movement.amount)}</strong>
              </article>
            )
          })}
        </div>
      </section>

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
