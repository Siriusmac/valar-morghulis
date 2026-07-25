import { ArrowRight, CheckCircle2, LoaderCircle, Scale } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { Modal } from './components/Modal'
import { MovementList } from './components/MovementList'
import { Dashboard } from './features/Dashboard'
import { MovementForm } from './features/MovementForm'
import { MovementsPage } from './features/MovementsPage'
import { AccountsPage, BeneficiariesPage, CategoriesPage, TagsPage } from './features/ManagementPages'
import { ScheduledPaymentsPage } from './features/ScheduledPaymentsPage'
import { TransferForm } from './features/TransferForm'
import { CloudAccess, type FamilySession } from './features/CloudAccess'
import { AccountSettings } from './features/AccountSettings'
import { sharedBalance, visibleMovements } from './lib/calculations'
import { formatMoney, makeId, todayISO } from './lib/format'
import { createStarterData, users } from './lib/seed'
import { hasMeaningfulUserData, hydrateData, loadData, mergeAppData, saveData } from './lib/storage'
import { deleteMovementData, saveMovementData, type MovementAdditions } from './lib/movements'
import { cloudAuthEnabled } from './lib/supabase'
import type { AppData, Beneficiary, Movement, PageId, Transfer, User, UserId } from './types'

type ModalState =
  | { type: 'movement'; movement?: Movement }
  | { type: 'reimburse' }
  | { type: 'transfer' }
  | { type: 'details'; title: string; filter: (movement: Movement) => boolean }
  | null

export default function App() {
  if (cloudAuthEnabled) return <CloudAccess>{(context) => <FinanceApp key={`${context.familyId}:${context.user.id}`} cloud={context} />}</CloudAccess>
  return <FinanceApp />
}

function FinanceApp({ cloud }: { cloud?: FamilySession }) {
  const appUsers = cloud?.members ?? users
  const storageKey = cloud ? `valar-morghulis:family:${cloud.familyId}:user:${cloud.user.id}:v3` : undefined
  const [data, setData] = useState<AppData>(() => cloud ? loadData(storageKey, createStarterData(cloud.user.id, cloud.sharedAccounts)) : loadData())
  const [userId, setUserId] = useState<UserId | null>(() => {
    if (cloud) return cloud.user.id
    const demoUser = new URLSearchParams(window.location.search).get('demo')
    if (demoUser === 'simone' || demoUser === 'anna') return demoUser
    return sessionStorage.getItem('vm:user') as UserId | null
  })
  const [page, setPage] = useState<PageId>(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return ['dashboard', 'movements', 'scheduled', 'accounts', 'categories', 'beneficiaries', 'tags', 'account'].includes(requested ?? '') ? requested as PageId : 'dashboard'
  })
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')
  const [cloudDataReady, setCloudDataReady] = useState(!cloud)
  const cloudSaveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => { if (storageKey) saveData(data, storageKey); else saveData(data) }, [data, storageKey])
  useEffect(() => {
    if (!cloud || !storageKey) return
    let cancelled = false
    const sync = async () => {
      const fallback = createStarterData(cloud.user.id, cloud.sharedAccounts)
      const localData = loadData(storageKey, fallback)
      const remoteData = await cloud.loadAppData()
      const importKey = cloudImportKey(cloud.familyId, cloud.user.id)
      const shouldImportLocal = !localStorage.getItem(importKey) && hasMeaningfulUserData(localData, cloud.user.id)
      const resolved = remoteData
        ? (shouldImportLocal ? mergeAppData(remoteData, localData, fallback) : hydrateData(remoteData, fallback))
        : localData

      if (!remoteData || shouldImportLocal) await cloud.saveAppData(resolved)
      if (cancelled) return
      saveData(resolved, storageKey)
      localStorage.setItem(importKey, '1')
      setData(resolved)
      setCloudDataReady(true)
    }
    void sync().catch(() => {
      if (cancelled) return
      setCloudDataReady(true)
      setToast('Cloud non raggiungibile: i dati restano salvati su questo dispositivo')
    })
    return () => { cancelled = true }
  }, [cloud, storageKey])
  useEffect(() => {
    if (!cloud || !cloudDataReady) return
    cloudSaveQueue.current = cloudSaveQueue.current
      .catch(() => undefined)
      .then(() => cloud.saveAppData(data))
      .catch(() => { setToast('Salvataggio cloud non riuscito: riproveremo alla prossima modifica') })
  }, [cloud, cloudDataReady, data])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) }, [toast])
  const user = useMemo(() => appUsers.find((item) => item.id === userId), [appUsers, userId])
  const login = (id: UserId) => { sessionStorage.setItem('vm:user', id); setUserId(id) }
  const logout = () => {
    if (cloud) { void cloud.signOut(); return }
    sessionStorage.removeItem('vm:user'); setUserId(null); setPage('dashboard')
  }
  if (!user) return <Login onLogin={login} />
  if (cloud && !cloudDataReady) return <main className="access-status"><LoaderCircle className="spin" /><p>Sincronizziamo i tuoi dati…</p></main>

  const saveMovement = (movement: Movement, additions: MovementAdditions) => {
    setData((current) => saveMovementData(current, movement, additions))
    setModal(null); setToast(`${movement.type === 'income' ? 'Entrata' : 'Spesa'} ${movement.shared ? 'condivisa ' : ''}salvata`)
  }
  const deleteMovement = (id: string) => {
    setData((current) => deleteMovementData(current, id))
    setModal(null)
    setToast('Movimento eliminato e saldi aggiornati')
  }
  const registerReimbursement = (amount: number, fromAccountId: string, toAccountId: string, counterpartId: string) => {
    const balance = sharedBalance(data, user.id, appUsers.length); const otherId = counterpartId
    if (!otherId) return
    const fromId = balance < 0 ? user.id : otherId; const toId = balance < 0 ? otherId : user.id
    setData((current) => ({ ...current, reimbursements: [...current.reimbursements, { id: makeId('reimbursement'), fromId, toId, amount, date: todayISO(), authorId: user.id, fromAccountId, toAccountId }] }))
    setModal(null); setToast('Rimborso registrato')
  }
  const saveTransfer = (transfer: Transfer) => { setData((current) => ({ ...current, transfers: [...current.transfers, transfer] })); setModal(null); setToast('Giro fondi completato') }
  const updateAccount = (account: AppData['accounts'][number]) => {
    setData((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? account : item) }))
    if (cloud && account.scope === 'family') {
      void cloud.updateSharedAccount(account)
        .then(() => setToast('Saldo iniziale condiviso aggiornato'))
        .catch(() => setToast('Saldo aggiornato sul dispositivo, ma non sincronizzato'))
      return
    }
    setToast('Saldo iniziale aggiornato')
  }
  const showMovements = (title: string, filter: (movement: Movement) => boolean) => setModal({ type: 'details', title, filter })

  const common = { data, user, onShowMovements: showMovements }
  const content = page === 'dashboard' ? <Dashboard data={data} user={user} members={appUsers} onNavigate={setPage} onReimburse={() => setModal({ type: 'reimburse' })} />
    : page === 'movements' ? <MovementsPage data={data} user={user} onEdit={(movement) => setModal({ type: 'movement', movement })} onDelete={deleteMovement} />
    : page === 'scheduled' ? <ScheduledPaymentsPage data={data} user={user} />
    : page === 'accounts' ? <AccountsPage {...common} onTransfer={() => setModal({ type: 'transfer' })} onAdd={(account) => setData((current) => ({ ...current, accounts: [...current.accounts, account] }))} onUpdate={updateAccount} />
    : page === 'categories' ? <CategoriesPage {...common} onAdd={(category) => setData((current) => ({ ...current, categories: [...current.categories, category] }))} onUpdate={(category) => setData((current) => ({ ...current, categories: current.categories.map((item) => item.id === category.id ? category : item) }))} />
    : page === 'beneficiaries' ? <BeneficiariesPage {...common} onAdd={(beneficiary: Beneficiary) => setData((current) => ({ ...current, beneficiaries: [...current.beneficiaries, beneficiary] }))} onUpdate={(beneficiary) => {
      setData((current) => ({ ...current, beneficiaries: current.beneficiaries.map((item) => item.id === beneficiary.id ? beneficiary : item) }))
      setToast('Beneficiario aggiornato in tutti i movimenti')
    }} />
    : page === 'tags' ? <TagsPage {...common} onAdd={(tag) => setData((current) => ({ ...current, tags: [...current.tags, tag] }))} onAddReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.includes(tagId) ? current.tagReportIds : [...current.tagReportIds, tagId] }))} onRemoveReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.filter((id) => id !== tagId) }))} />
    : <AccountSettings user={user} cloud={cloud} />

  const detailMovements = modal?.type === 'details' ? visibleMovements(data, user.id).filter(modal.filter).toSorted((a, b) => b.date.localeCompare(a.date)) : []
  return <>
    <AppShell page={page} user={user} onPageChange={setPage} onAddMovement={() => setModal({ type: 'movement' })} onLogout={logout}>{content}</AppShell>
    {modal?.type === 'movement' ? <Modal title={modal.movement ? 'Modifica movimento' : 'Nuovo movimento'} onClose={() => setModal(null)} wide><MovementForm data={data} user={user} otherName={appUsers.find((item) => item.id !== user.id)?.name} memberCount={appUsers.length} initial={modal.movement} onSave={saveMovement} onDelete={deleteMovement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'reimburse' ? <Modal title="Registra rimborso" onClose={() => setModal(null)}><ReimbursementForm data={data} userId={user.id} members={appUsers} onSubmit={registerReimbursement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'transfer' ? <Modal title="Giro fondi" onClose={() => setModal(null)}><TransferForm data={data} user={user} memberCount={appUsers.length} onSubmit={saveTransfer} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'details' ? <Modal title={modal.title} onClose={() => setModal(null)} wide><MovementList data={data} movements={detailMovements} compact /></Modal> : null}
    {toast ? <div className="toast" role="status"><CheckCircle2 />{toast}</div> : null}
  </>
}

function cloudImportKey(familyId: string, userId: string) {
  return `valar-morghulis:cloud-imported:${familyId}:${userId}:v1`
}

function ReimbursementForm({ data, userId, members, onSubmit, onCancel }: { data: AppData; userId: UserId; members: User[]; onSubmit: (amount: number, fromAccountId: string, toAccountId: string, counterpartId: string) => void; onCancel: () => void }) {
  const balance = sharedBalance(data, userId, members.length)
  const counterparts = members.filter((item) => item.id !== userId)
  const [counterpartId, setCounterpartId] = useState(counterparts[0]?.id ?? '')
  const other = counterparts.find((item) => item.id === counterpartId) ?? counterparts[0] ?? members[0]
  const debtorId = balance < 0 ? userId : other.id
  const creditorId = balance < 0 ? other.id : userId
  const debtorAccounts = data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === debtorId)
  const creditorAccounts = data.accounts.filter((item) => item.scope === 'family' || (item.scope === 'personal' && item.ownerId === creditorId))
  const [amount, setAmount] = useState(Math.abs(balance).toFixed(2).replace('.', ','))
  const [fromAccountId, setFromAccountId] = useState(debtorAccounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(creditorAccounts[0]?.id ?? '')
  const destinationAccount = creditorAccounts.find((item) => item.id === toAccountId)
  const label = balance < 0 ? `Tu rimborsi ${other.name}` : `${other.name} rimborsa te`
  const canSubmit = Boolean(counterpartId && fromAccountId && toAccountId)
  const selectCounterpart = (nextCounterpartId: string) => {
    setCounterpartId(nextCounterpartId)
    const nextDebtorId = balance < 0 ? userId : nextCounterpartId
    const nextCreditorId = balance < 0 ? nextCounterpartId : userId
    setFromAccountId(data.accounts.find((item) => item.scope === 'personal' && item.ownerId === nextDebtorId)?.id ?? '')
    setToAccountId(data.accounts.find((item) => item.scope === 'family' || (item.scope === 'personal' && item.ownerId === nextCreditorId))?.id ?? '')
  }
  return <form className="reimbursement-form" onSubmit={(event) => {
    event.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (value > 0 && canSubmit) onSubmit(value, fromAccountId, toAccountId, counterpartId)
  }}>
    <span className="reimbursement-form__icon"><Scale /></span>
    <p>{label}</p>
    <strong>Saldo attuale: {formatMoney(Math.abs(balance))}</strong>
    {counterparts.length > 1 ? <label>Altro membro coinvolto<select value={counterpartId} onChange={(event) => selectCounterpart(event.target.value)} required>{counterparts.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label> : null}
    <label>Importo del rimborso<div className="money-input"><span>€</span><input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} autoFocus required /></div></label>
    <label>Conto di origine del debitore<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>{debtorAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.institution}</option>)}</select></label>
    <label>Conto di destinazione<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>{creditorAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.institution}{item.scope === 'family' ? ' · Condiviso' : ''}</option>)}</select></label>
    {destinationAccount?.scope === 'family' ? <small>Il conto di destinazione è condiviso: il rimborso compensa soltanto la quota che appartiene agli altri {members.length - 1} membri.</small> : balance > 0 ? <small>Stai registrando il rimborso come creditore: specifica sia il conto di origine di {other.name}, sia il tuo conto di destinazione.</small> : <small>Specifica il tuo conto di origine e il conto di destinazione di {other.name}. Il pagamento non viene eseguito dall’app: viene registrata soltanto la compensazione.</small>}
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={!canSubmit}>Registra rimborso <ArrowRight /></button></div>
  </form>
}
