import { ArrowRight, CheckCircle2, LoaderCircle, Scale } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { Modal } from './components/Modal'
import { CloudAccess, type FamilySession } from './features/CloudAccess'
import { sharedBalance, visibleMovements } from './lib/calculations'
import { formatMoney, makeId, todayISO } from './lib/format'
import { createPersonalStarterData, createStarterData, users } from './lib/seed'
import { hasMeaningfulUserData, hydrateData, loadData, mergeAppData, saveData } from './lib/storage'
import { deleteMovementData, saveMovementData, type MovementAdditions } from './lib/movements'
import { deleteCounterpartyData, type CounterpartyKind } from './lib/directories'
import { cloudAuthEnabled } from './lib/supabase'
import type { AppData, Beneficiary, Movement, PageId, ReimbursementAccountReference, Sender, Transfer, User, UserId } from './types'

const MovementList = lazy(() => import('./components/MovementList').then((module) => ({ default: module.MovementList })))
const Dashboard = lazy(() => import('./features/Dashboard').then((module) => ({ default: module.Dashboard })))
const GuidePage = lazy(() => import('./features/GuidePage').then((module) => ({ default: module.GuidePage })))
const MovementForm = lazy(() => import('./features/MovementForm').then((module) => ({ default: module.MovementForm })))
const MovementsPage = lazy(() => import('./features/MovementsPage').then((module) => ({ default: module.MovementsPage })))
const AccountsPage = lazy(() => import('./features/ManagementPages').then((module) => ({ default: module.AccountsPage })))
const BeneficiariesPage = lazy(() => import('./features/ManagementPages').then((module) => ({ default: module.BeneficiariesPage })))
const CategoriesPage = lazy(() => import('./features/ManagementPages').then((module) => ({ default: module.CategoriesPage })))
const TagsPage = lazy(() => import('./features/ManagementPages').then((module) => ({ default: module.TagsPage })))
const ScheduledPaymentsPage = lazy(() => import('./features/ScheduledPaymentsPage').then((module) => ({ default: module.ScheduledPaymentsPage })))
const TransferForm = lazy(() => import('./features/TransferForm').then((module) => ({ default: module.TransferForm })))
const AccountSettings = lazy(() => import('./features/AccountSettings').then((module) => ({ default: module.AccountSettings })))

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
  const starterData = cloud ? (cloud.personalMode ? createPersonalStarterData(cloud.user.id) : createStarterData(cloud.user.id, cloud.sharedAccounts)) : undefined
  const [data, setData] = useState<AppData>(() => cloud ? loadData(storageKey, starterData!) : loadData())
  const [userId, setUserId] = useState<UserId | null>(() => {
    if (cloud) return cloud.user.id
    const demoUser = new URLSearchParams(window.location.search).get('demo')
    if (demoUser === 'simone' || demoUser === 'anna') return demoUser
    return sessionStorage.getItem('vm:user') as UserId | null
  })
  const [page, setPage] = useState<PageId>(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return ['dashboard', 'movements', 'scheduled', 'accounts', 'categories', 'beneficiaries', 'tags', 'guide', 'account'].includes(requested ?? '') ? requested as PageId : 'dashboard'
  })
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')
  const [cloudDataReady, setCloudDataReady] = useState(!cloud)
  const cloudSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const skipNextCloudSave = useRef(false)
  const sharedRefreshTimer = useRef<number | undefined>(undefined)

  useEffect(() => { if (storageKey) saveData(data, storageKey); else saveData(data) }, [data, storageKey])
  useEffect(() => {
    if (!cloud || !storageKey) return
    let cancelled = false
    const sync = async () => {
      const fallback = cloud.personalMode ? createPersonalStarterData(cloud.user.id) : createStarterData(cloud.user.id, cloud.sharedAccounts)
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
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false
      return
    }
    cloudSaveQueue.current = cloudSaveQueue.current
      .catch(() => undefined)
      .then(() => cloud.saveAppData(data))
      .catch(() => { setToast('Salvataggio cloud non riuscito: riproveremo alla prossima modifica') })
  }, [cloud, cloudDataReady, data])
  useEffect(() => {
    if (!cloud || !cloudDataReady || !cloud.subscribeToSharedData) return
    const refresh = () => {
      window.clearTimeout(sharedRefreshTimer.current)
      sharedRefreshTimer.current = window.setTimeout(() => {
        void cloud.loadAppData().then((remoteData) => {
          if (!remoteData) return
          const fallback = cloud.personalMode ? createPersonalStarterData(cloud.user.id) : createStarterData(cloud.user.id, cloud.sharedAccounts)
          skipNextCloudSave.current = true
          setData(hydrateData(remoteData, fallback))
        }).catch(() => setToast('Aggiornamento familiare non riuscito: riproveremo automaticamente'))
      }, 250)
    }
    const unsubscribe = cloud.subscribeToSharedData(refresh)
    return () => {
      window.clearTimeout(sharedRefreshTimer.current)
      unsubscribe()
    }
  }, [cloud, cloudDataReady])
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
  const deleteCounterparty = (kind: CounterpartyKind, id: string, replacementId?: string) => {
    const item = kind === 'beneficiary'
      ? data.beneficiaries.find((entry) => entry.id === id)
      : data.senders.find((entry) => entry.id === id)
    setData((current) => deleteCounterpartyData(current, kind, id, replacementId))
    if (cloud && item?.scope === 'family' && cloud.deleteSharedDirectory) {
      void cloud.deleteSharedDirectory(kind, id, replacementId)
        .catch(() => setToast('Anagrafica eliminata sul dispositivo, ma non ancora sincronizzata'))
    }
    setToast(`${kind === 'beneficiary' ? 'Beneficiario' : 'Mittente'} eliminato`)
  }
  const registerReimbursement = (amount: number, fromAccountId: string | undefined, toAccountId: string | undefined, counterpartId: string) => {
    const balance = sharedBalance(data, user.id, appUsers.length); const otherId = counterpartId
    if (!otherId) return
    const fromId = balance < 0 ? user.id : otherId; const toId = balance < 0 ? otherId : user.id
    setData((current) => ({ ...current, reimbursements: [...current.reimbursements, { id: makeId('reimbursement'), fromId, toId, amount, date: todayISO(), authorId: user.id, fromAccountId, toAccountId, status: cloud ? 'pending' : 'confirmed' }] }))
    setModal(null); setToast(cloud ? 'Rimborso inviato per conferma' : 'Rimborso registrato')
  }
  const respondToReimbursement = async (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => {
    if (!cloud) return
    try {
      await cloud.respondToReimbursement(reimbursementId, accepted, selectedAccountId)
      setToast(accepted ? 'Rimborso confermato e saldi aggiornati' : 'Rimborso rifiutato')
    } catch {
      setToast('Non è stato possibile aggiornare il rimborso')
    }
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
  const content = page === 'dashboard' ? <Dashboard data={data} user={user} members={appUsers} onNavigate={setPage} onReimburse={() => setModal({ type: 'reimburse' })} onRespondReimbursement={cloud ? respondToReimbursement : undefined} workspace={cloud ? {
    familyId: cloud.familyId,
    families: cloud.families,
    personalMode: cloud.personalMode,
    onSwitch: cloud.switchFamily,
  } : undefined} />
    : page === 'movements' ? <MovementsPage data={data} user={user} onEdit={(movement) => setModal({ type: 'movement', movement })} onDelete={deleteMovement} />
    : page === 'scheduled' ? <ScheduledPaymentsPage data={data} user={user} />
    : page === 'accounts' ? <AccountsPage {...common} onTransfer={() => setModal({ type: 'transfer' })} onAdd={(account) => setData((current) => ({ ...current, accounts: [...current.accounts, account] }))} onUpdate={updateAccount} reimbursementSharing={cloud && !cloud.personalMode ? {
      references: cloud.reimbursementAccountReferences,
      onChange: async (account, visible) => {
        try {
          await cloud.setReimbursementAccountVisibility(account, visible)
          setToast(visible ? 'Nome del conto disponibile per i rimborsi' : 'Conto rimosso dalle scelte dei rimborsi')
        } catch {
          setToast('Non è stato possibile aggiornare la visibilità del conto')
        }
      },
    } : undefined} />
    : page === 'categories' ? <CategoriesPage {...common} onAdd={(category) => setData((current) => ({ ...current, categories: [...current.categories, category] }))} onUpdate={(category) => setData((current) => ({ ...current, categories: current.categories.map((item) => item.id === category.id ? category : item) }))} />
    : page === 'beneficiaries' ? <BeneficiariesPage {...common} onAddBeneficiary={(beneficiary: Beneficiary) => setData((current) => ({ ...current, beneficiaries: [...current.beneficiaries, beneficiary] }))} onUpdateBeneficiary={(beneficiary) => {
      setData((current) => ({ ...current, beneficiaries: current.beneficiaries.map((item) => item.id === beneficiary.id ? beneficiary : item) }))
      setToast('Beneficiario aggiornato in tutti i movimenti')
    }} onDeleteBeneficiary={(id, replacementId) => deleteCounterparty('beneficiary', id, replacementId)} onAddSender={(sender: Sender) => setData((current) => ({ ...current, senders: [...current.senders, sender] }))} onUpdateSender={(sender) => {
      setData((current) => ({ ...current, senders: current.senders.map((item) => item.id === sender.id ? sender : item) }))
      setToast('Mittente aggiornato in tutti i movimenti')
    }} onDeleteSender={(id, replacementId) => deleteCounterparty('sender', id, replacementId)} />
    : page === 'tags' ? <TagsPage {...common} onAdd={(tag) => setData((current) => ({ ...current, tags: [...current.tags, tag] }))} onAddReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.includes(tagId) ? current.tagReportIds : [...current.tagReportIds, tagId] }))} onRemoveReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.filter((id) => id !== tagId) }))} />
    : page === 'guide' ? <GuidePage />
    : <AccountSettings user={user} cloud={cloud} />

  const detailMovements = modal?.type === 'details' ? visibleMovements(data, user.id).filter(modal.filter).toSorted((a, b) => b.date.localeCompare(a.date)) : []
  return <>
    <AppShell page={page} user={user} registeredUserCount={cloud ? cloud.registeredUserCount : appUsers.length} onPageChange={setPage} onAddMovement={() => setModal({ type: 'movement' })} onLogout={logout}>
      <Suspense fallback={<FeatureLoading />}>{content}</Suspense>
    </AppShell>
    {modal?.type === 'movement' ? <Modal title={modal.movement ? 'Modifica movimento' : 'Nuovo movimento'} onClose={() => setModal(null)} wide><Suspense fallback={<FeatureLoading compact />}><MovementForm data={data} user={user} otherName={appUsers.find((item) => item.id !== user.id)?.name} memberCount={appUsers.length} initial={modal.movement} personalOnly={cloud?.personalMode} onSave={saveMovement} onDelete={deleteMovement} onCancel={() => setModal(null)} /></Suspense></Modal> : null}
    {modal?.type === 'reimburse' ? <Modal title="Registra rimborso" onClose={() => setModal(null)}><ReimbursementForm data={data} userId={user.id} members={appUsers} accountReferences={cloud?.reimbursementAccountReferences ?? []} requireConfirmation={Boolean(cloud)} onSubmit={registerReimbursement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'transfer' ? <Modal title="Giro fondi" onClose={() => setModal(null)}><Suspense fallback={<FeatureLoading compact />}><TransferForm data={data} user={user} memberCount={appUsers.length} onSubmit={saveTransfer} onCancel={() => setModal(null)} /></Suspense></Modal> : null}
    {modal?.type === 'details' ? <Modal title={modal.title} onClose={() => setModal(null)} wide><Suspense fallback={<FeatureLoading compact />}><MovementList data={data} movements={detailMovements} compact /></Suspense></Modal> : null}
    {toast ? <div className="toast" role="status"><CheckCircle2 />{toast}</div> : null}
  </>
}

function FeatureLoading({ compact = false }: { compact?: boolean }) {
  return <div className={`feature-loading ${compact ? 'feature-loading--compact' : ''}`} role="status"><LoaderCircle className="spin" />Caricamento…</div>
}

function cloudImportKey(familyId: string, userId: string) {
  return `valar-morghulis:cloud-imported:${familyId}:${userId}:v1`
}

function ReimbursementForm({ data, userId, members, accountReferences, requireConfirmation, onSubmit, onCancel }: {
  data: AppData
  userId: UserId
  members: User[]
  accountReferences: ReimbursementAccountReference[]
  requireConfirmation: boolean
  onSubmit: (amount: number, fromAccountId: string | undefined, toAccountId: string | undefined, counterpartId: string) => void
  onCancel: () => void
}) {
  const balance = sharedBalance(data, userId, members.length)
  const counterparts = members.filter((item) => item.id !== userId)
  const [counterpartId, setCounterpartId] = useState(counterparts[0]?.id ?? '')
  const other = counterparts.find((item) => item.id === counterpartId) ?? counterparts[0] ?? members[0]
  const debtorId = balance < 0 ? userId : other.id
  const creditorId = balance < 0 ? other.id : userId
  const sharedAccounts = data.accounts.filter((item) => item.scope === 'family')
  const accountOptions = (ownerId: UserId, includeShared: boolean) => {
    const personal = ownerId === userId || !requireConfirmation
      ? data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === ownerId).map((item) => ({ id: item.id, label: `${item.name} · ${item.institution}` }))
      : accountReferences.filter((item) => item.ownerId === ownerId).map((item) => ({ id: item.accountId, label: item.name }))
    return [...personal, ...(includeShared ? sharedAccounts.map((item) => ({ id: item.id, label: `${item.name} · Condiviso` })) : [])]
  }
  const debtorAccounts = accountOptions(debtorId, false)
  const creditorAccounts = accountOptions(creditorId, true)
  const [amount, setAmount] = useState(Math.abs(balance).toFixed(2).replace('.', ','))
  const [fromAccountId, setFromAccountId] = useState(debtorAccounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(creditorAccounts[0]?.id ?? '')
  const destinationAccount = data.accounts.find((item) => item.id === toAccountId)
  const label = balance < 0 ? `Tu rimborsi ${other.name}` : `${other.name} rimborsa te`
  const canSubmit = Boolean(counterpartId)
  const selectCounterpart = (nextCounterpartId: string) => {
    setCounterpartId(nextCounterpartId)
    const nextDebtorId = balance < 0 ? userId : nextCounterpartId
    const nextCreditorId = balance < 0 ? nextCounterpartId : userId
    setFromAccountId(accountOptions(nextDebtorId, false)[0]?.id ?? '')
    setToAccountId(accountOptions(nextCreditorId, true)[0]?.id ?? '')
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
    <label>Conto di origine del debitore<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}><option value="">Conto da specificare dal debitore</option>{debtorAccounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Conto di destinazione<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">Conto da specificare dal creditore</option>{creditorAccounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {destinationAccount?.scope === 'family' ? <small>Il conto di destinazione è condiviso: il rimborso compensa soltanto la quota che appartiene agli altri {members.length - 1} membri.</small> : balance > 0 ? <small>Stai registrando il rimborso come creditore: specifica sia il conto di origine di {other.name}, sia il tuo conto di destinazione.</small> : <small>Specifica il tuo conto di origine e il conto di destinazione di {other.name}. Il pagamento non viene eseguito dall’app: viene registrata soltanto la compensazione.</small>}
    <p className="privacy-note">Degli altri membri sono visibili soltanto i nomi dei conti autorizzati. Saldi, istituti e movimenti restano privati.</p>
    {requireConfirmation ? <p className="privacy-note">Il rimborso aggiornerà i saldi solo dopo la conferma dell’altro membro, che potrà completare il proprio conto se manca.</p> : null}
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={!canSubmit}>{requireConfirmation ? 'Invia per conferma' : 'Registra rimborso'} <ArrowRight /></button></div>
  </form>
}
