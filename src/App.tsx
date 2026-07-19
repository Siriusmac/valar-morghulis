import { ArrowRight, CheckCircle2, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { Modal } from './components/Modal'
import { Dashboard } from './features/Dashboard'
import { ExpenseForm } from './features/ExpenseForm'
import { ExpensesPage } from './features/ExpensesPage'
import { AccountsPage, BeneficiariesPage, CategoriesPage } from './features/ManagementPages'
import { sharedBalance } from './lib/calculations'
import { formatMoney, makeId, todayISO } from './lib/format'
import { users } from './lib/seed'
import { loadData, saveData } from './lib/storage'
import type { AppData, Beneficiary, Category, Expense, PageId, UserId } from './types'

type ModalState = { type: 'expense'; expense?: Expense } | { type: 'reimburse' } | null

export default function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [userId, setUserId] = useState<UserId | null>(() => {
    const demoUser = new URLSearchParams(window.location.search).get('demo')
    if (demoUser === 'simone' || demoUser === 'anna') return demoUser
    return sessionStorage.getItem('vm:user') as UserId | null
  })
  const [page, setPage] = useState<PageId>('dashboard')
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')

  useEffect(() => saveData(data), [data])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const user = useMemo(() => users.find((item) => item.id === userId), [userId])
  const login = (id: UserId) => { sessionStorage.setItem('vm:user', id); setUserId(id) }
  const logout = () => { sessionStorage.removeItem('vm:user'); setUserId(null); setPage('dashboard') }

  if (!user) return <Login onLogin={login} />

  const saveExpense = (expense: Expense, additions: { category?: Category; beneficiary?: Beneficiary }) => {
    setData((current) => ({
      ...current,
      categories: additions.category ? [...current.categories, additions.category] : current.categories,
      beneficiaries: additions.beneficiary ? [...current.beneficiaries, additions.beneficiary] : current.beneficiaries,
      expenses: current.expenses.some((item) => item.id === expense.id)
        ? current.expenses.map((item) => item.id === expense.id ? expense : item)
        : [expense, ...current.expenses],
    }))
    setModal(null); setToast(expense.shared ? 'Spesa condivisa salvata' : 'Spesa personale salvata')
  }

  const registerReimbursement = (amount: number) => {
    const balance = sharedBalance(data, user.id)
    const otherId: UserId = user.id === 'simone' ? 'anna' : 'simone'
    const fromId = balance < 0 ? user.id : otherId
    const toId = balance < 0 ? otherId : user.id
    setData((current) => ({ ...current, reimbursements: [...current.reimbursements, { id: makeId('reimbursement'), fromId, toId, amount, date: todayISO(), authorId: user.id }] }))
    setModal(null); setToast('Rimborso registrato: siete più vicini al pareggio')
  }

  const content = page === 'dashboard'
    ? <Dashboard data={data} user={user} onNavigate={setPage} onReimburse={() => setModal({ type: 'reimburse' })} />
    : page === 'expenses'
      ? <ExpensesPage data={data} user={user} onEdit={(expense) => setModal({ type: 'expense', expense })} onDelete={(id) => setData((current) => ({ ...current, expenses: current.expenses.filter((item) => item.id !== id) }))} />
      : page === 'accounts'
        ? <AccountsPage data={data} user={user} onAdd={(account) => setData((current) => ({ ...current, accounts: [...current.accounts, account] }))} />
        : page === 'categories'
          ? <CategoriesPage data={data} user={user} onAdd={(category) => setData((current) => ({ ...current, categories: [...current.categories, category] }))} />
          : <BeneficiariesPage data={data} user={user} onAdd={(beneficiary: Beneficiary) => setData((current) => ({ ...current, beneficiaries: [...current.beneficiaries, beneficiary] }))} />

  return (
    <>
      <AppShell page={page} user={user} onPageChange={setPage} onAddExpense={() => setModal({ type: 'expense' })} onLogout={logout}>
        {content}
      </AppShell>
      {modal?.type === 'expense' ? <Modal title={modal.expense ? 'Modifica spesa' : 'Nuova spesa'} onClose={() => setModal(null)} wide><ExpenseForm data={data} user={user} initial={modal.expense} onSave={saveExpense} onCancel={() => setModal(null)} /></Modal> : null}
      {modal?.type === 'reimburse' ? <Modal title="Registra rimborso" onClose={() => setModal(null)}><ReimbursementForm data={data} userId={user.id} onSubmit={registerReimbursement} onCancel={() => setModal(null)} /></Modal> : null}
      {toast ? <div className="toast" role="status"><CheckCircle2 />{toast}</div> : null}
    </>
  )
}

function ReimbursementForm({ data, userId, onSubmit, onCancel }: { data: AppData; userId: UserId; onSubmit: (amount: number) => void; onCancel: () => void }) {
  const balance = sharedBalance(data, userId)
  const other = users.find((item) => item.id !== userId)!
  const [amount, setAmount] = useState(Math.abs(balance).toFixed(2).replace('.', ','))
  const label = balance < 0 ? `Tu rimborsi ${other.name}` : `${other.name} rimborsa te`
  return <form className="reimbursement-form" onSubmit={(event) => { event.preventDefault(); const value = Number(amount.replace(',', '.')); if (value > 0) onSubmit(value) }}>
    <span className="reimbursement-form__icon"><Scale /></span>
    <p>{label}</p>
    <strong>Saldo attuale: {formatMoney(Math.abs(balance))}</strong>
    <label>Importo del rimborso<div className="money-input"><span>€</span><input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} autoFocus /></div></label>
    <small>Il pagamento non viene eseguito dall’app: ne registriamo soltanto l’avvenuta compensazione.</small>
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">Registra rimborso <ArrowRight /></button></div>
  </form>
}
