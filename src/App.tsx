import { ArrowRight, CheckCircle2, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { Modal } from './components/Modal'
import { MovementList } from './components/MovementList'
import { Dashboard } from './features/Dashboard'
import { MovementForm } from './features/MovementForm'
import { MovementsPage } from './features/MovementsPage'
import { AccountsPage, BeneficiariesPage, CategoriesPage, TagsPage } from './features/ManagementPages'
import { TransferForm } from './features/TransferForm'
import { sharedBalance, visibleMovements } from './lib/calculations'
import { formatMoney, makeId, todayISO } from './lib/format'
import { users } from './lib/seed'
import { loadData, saveData } from './lib/storage'
import type { AppData, Beneficiary, Category, Movement, PageId, Tag, Transfer, UserId } from './types'

type ModalState =
  | { type: 'movement'; movement?: Movement }
  | { type: 'reimburse' }
  | { type: 'transfer' }
  | { type: 'details'; title: string; filter: (movement: Movement) => boolean }
  | null

export default function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [userId, setUserId] = useState<UserId | null>(() => {
    const demoUser = new URLSearchParams(window.location.search).get('demo')
    if (demoUser === 'simone' || demoUser === 'anna') return demoUser
    return sessionStorage.getItem('vm:user') as UserId | null
  })
  const [page, setPage] = useState<PageId>(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return ['dashboard', 'movements', 'accounts', 'categories', 'beneficiaries', 'tags'].includes(requested ?? '') ? requested as PageId : 'dashboard'
  })
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')

  useEffect(() => saveData(data), [data])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) }, [toast])
  const user = useMemo(() => users.find((item) => item.id === userId), [userId])
  const login = (id: UserId) => { sessionStorage.setItem('vm:user', id); setUserId(id) }
  const logout = () => { sessionStorage.removeItem('vm:user'); setUserId(null); setPage('dashboard') }
  if (!user) return <Login onLogin={login} />

  const saveMovement = (movement: Movement, additions: { category?: Category; beneficiary?: Beneficiary; tag?: Tag }) => {
    setData((current) => ({ ...current,
      categories: additions.category ? [...current.categories, additions.category] : current.categories,
      beneficiaries: additions.beneficiary ? [...current.beneficiaries, additions.beneficiary] : current.beneficiaries,
      tags: additions.tag ? [...current.tags, additions.tag] : current.tags,
      movements: current.movements.some((item) => item.id === movement.id) ? current.movements.map((item) => item.id === movement.id ? movement : item) : [movement, ...current.movements],
    }))
    setModal(null); setToast(`${movement.type === 'income' ? 'Entrata' : 'Spesa'} ${movement.shared ? 'condivisa ' : ''}salvata`)
  }
  const registerReimbursement = (amount: number, fromAccountId: string, toAccountId: string) => {
    const balance = sharedBalance(data, user.id); const otherId: UserId = user.id === 'simone' ? 'anna' : 'simone'; const fromId = balance < 0 ? user.id : otherId; const toId = balance < 0 ? otherId : user.id
    setData((current) => ({ ...current, reimbursements: [...current.reimbursements, { id: makeId('reimbursement'), fromId, toId, amount, date: todayISO(), authorId: user.id, fromAccountId, toAccountId }] }))
    setModal(null); setToast('Rimborso registrato')
  }
  const saveTransfer = (transfer: Transfer) => { setData((current) => ({ ...current, transfers: [...current.transfers, transfer] })); setModal(null); setToast('Giro fondi completato') }
  const showMovements = (title: string, filter: (movement: Movement) => boolean) => setModal({ type: 'details', title, filter })

  const common = { data, user, onShowMovements: showMovements }
  const content = page === 'dashboard' ? <Dashboard data={data} user={user} onNavigate={setPage} onReimburse={() => setModal({ type: 'reimburse' })} />
    : page === 'movements' ? <MovementsPage data={data} user={user} onEdit={(movement) => setModal({ type: 'movement', movement })} onDelete={(id) => setData((current) => ({ ...current, movements: current.movements.filter((item) => item.id !== id) }))} />
    : page === 'accounts' ? <AccountsPage {...common} onTransfer={() => setModal({ type: 'transfer' })} onAdd={(account) => setData((current) => ({ ...current, accounts: [...current.accounts, account] }))} />
    : page === 'categories' ? <CategoriesPage {...common} onAdd={(category) => setData((current) => ({ ...current, categories: [...current.categories, category] }))} />
    : page === 'beneficiaries' ? <BeneficiariesPage {...common} onAdd={(beneficiary: Beneficiary) => setData((current) => ({ ...current, beneficiaries: [...current.beneficiaries, beneficiary] }))} />
    : <TagsPage {...common} onAdd={(tag) => setData((current) => ({ ...current, tags: [...current.tags, tag] }))} />

  const detailMovements = modal?.type === 'details' ? visibleMovements(data, user.id).filter(modal.filter).toSorted((a, b) => b.date.localeCompare(a.date)) : []
  return <>
    <AppShell page={page} user={user} onPageChange={setPage} onAddMovement={() => setModal({ type: 'movement' })} onLogout={logout}>{content}</AppShell>
    {modal?.type === 'movement' ? <Modal title={modal.movement ? 'Modifica movimento' : 'Nuovo movimento'} onClose={() => setModal(null)} wide><MovementForm data={data} user={user} initial={modal.movement} onSave={saveMovement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'reimburse' ? <Modal title="Registra rimborso" onClose={() => setModal(null)}><ReimbursementForm data={data} userId={user.id} onSubmit={registerReimbursement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'transfer' ? <Modal title="Giro fondi" onClose={() => setModal(null)}><TransferForm data={data} user={user} onSubmit={saveTransfer} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'details' ? <Modal title={modal.title} onClose={() => setModal(null)} wide><MovementList data={data} movements={detailMovements} compact /></Modal> : null}
    {toast ? <div className="toast" role="status"><CheckCircle2 />{toast}</div> : null}
  </>
}

function ReimbursementForm({ data, userId, onSubmit, onCancel }: { data: AppData; userId: UserId; onSubmit: (amount: number, fromAccountId: string, toAccountId: string) => void; onCancel: () => void }) {
  const balance = sharedBalance(data, userId)
  const other = users.find((item) => item.id !== userId)!
  const debtorId = balance < 0 ? userId : other.id
  const creditorId = balance < 0 ? other.id : userId
  const debtorAccounts = data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === debtorId)
  const creditorAccounts = data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === creditorId)
  const [amount, setAmount] = useState(Math.abs(balance).toFixed(2).replace('.', ','))
  const [fromAccountId, setFromAccountId] = useState(debtorAccounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(creditorAccounts[0]?.id ?? '')
  const label = balance < 0 ? `Tu rimborsi ${other.name}` : `${other.name} rimborsa te`
  const canSubmit = Boolean(fromAccountId && toAccountId)
  return <form className="reimbursement-form" onSubmit={(event) => {
    event.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (value > 0 && canSubmit) onSubmit(value, fromAccountId, toAccountId)
  }}>
    <span className="reimbursement-form__icon"><Scale /></span>
    <p>{label}</p>
    <strong>Saldo attuale: {formatMoney(Math.abs(balance))}</strong>
    <label>Importo del rimborso<div className="money-input"><span>€</span><input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} autoFocus required /></div></label>
    <label>Conto di origine del debitore<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>{debtorAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.institution}</option>)}</select></label>
    <label>Conto di destinazione del creditore<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>{creditorAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.institution}</option>)}</select></label>
    {balance > 0 ? <small>Stai registrando il rimborso come creditore: specifica sia il conto di origine di {other.name}, sia il tuo conto di destinazione.</small> : <small>Specifica il tuo conto di origine e il conto di destinazione di {other.name}. Il pagamento non viene eseguito dall’app: viene registrata soltanto la compensazione.</small>}
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={!canSubmit}>Registra rimborso <ArrowRight /></button></div>
  </form>
}
