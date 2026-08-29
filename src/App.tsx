import { ArrowRight, CheckCircle2, LoaderCircle, Scale } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { Modal } from './components/Modal'
import { CloudAccess, type FamilySession } from './features/CloudAccess'
import { reimbursementPlan, sharedBalance, visibleMovements } from './lib/calculations'
import { formatDate, formatMoney, makeId, todayISO } from './lib/format'
import { createPersonalStarterData, createStarterData, users } from './lib/seed'
import { hasMeaningfulUserData, hydrateData, loadData, mergeAppData, saveData } from './lib/storage'
import { deleteMovementData, saveMovementData, type MovementAdditions } from './lib/movements'
import { deleteDirectoryData, type DirectoryDeletionKind } from './lib/directories'
import { createCommissionedPurchase, familyContacts, inviteContact, loadContactData, removeContact, respondToCommissionedPurchase, withdrawContactInvitation, type ContactData } from './lib/contacts'
import { cloudAuthEnabled } from './lib/supabase'
import type { AppData, Beneficiary, CommissionedPurchase, Contact, Movement, MovementType, PageId, Reimbursement, ReimbursementAccountReference, Sender, Transfer, User, UserId } from './types'
import type { CommissionedPurchaseDraft } from './features/MovementForm'

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
const ContactsPage = lazy(() => import('./features/ContactsPage').then((module) => ({ default: module.ContactsPage })))
const ReimbursementsPage = lazy(() => import('./features/ReimbursementsPage').then((module) => ({ default: module.ReimbursementsPage })))

type ModalState =
  | { type: 'movement'; movement?: Movement; initialType?: MovementType }
  | { type: 'reimburse' }
  | { type: 'transfer' }
  | { type: 'details'; title: string; filter: (movement: Movement) => boolean; amount?: (movement: Movement) => number }
  | null

interface ReimbursementSubmission {
  amount: number
  fromAccountId?: string
  toAccountId?: string
  counterpartId: string
  settlementMethod: 'money' | 'purchase'
  description?: string
}

interface MultiReimbursementSelection {
  selected: boolean
  amount: string
  toAccountId: string
  settlementMethod: 'money' | 'purchase'
  description: string
}

const emptyContactData: ContactData = { friends: [], invitations: [], purchases: [] }

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
    return ['dashboard', 'movements', 'scheduled', 'reimbursements', 'accounts', 'categories', 'beneficiaries', 'tags', 'contacts', 'guide', 'account'].includes(requested ?? '') ? requested as PageId : 'dashboard'
  })
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')
  const [contactData, setContactData] = useState<ContactData>(emptyContactData)
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
  const refreshContacts = useCallback(async () => {
    if (!cloud) return
    try { setContactData(await loadContactData(cloud.user.id)) }
    catch { setToast('Non è stato possibile aggiornare i contatti') }
  }, [cloud])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshContacts() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshContacts])
  useEffect(() => {
    if (page !== 'contacts' || !cloud) return
    const timer = window.setTimeout(() => { void refreshContacts() }, 0)
    return () => window.clearTimeout(timer)
  }, [cloud, page, refreshContacts])
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
  const deleteDirectory = (kind: DirectoryDeletionKind, id: string, replacementId?: string) => {
    const items = kind === 'category' ? data.categories : kind === 'beneficiary' ? data.beneficiaries : data.senders
    const item = items.find((entry) => entry.id === id)
    setData((current) => deleteDirectoryData(current, kind, id, replacementId))
    if (cloud && item?.scope === 'family' && cloud.deleteSharedDirectory) {
      void cloud.deleteSharedDirectory(kind, id, replacementId)
        .catch(() => setToast('Anagrafica eliminata sul dispositivo, ma non ancora sincronizzata'))
    }
    setToast(`${kind === 'category' ? 'Categoria' : kind === 'beneficiary' ? 'Beneficiario' : 'Mittente'} eliminato`)
  }
  const registerReimbursement = async (submissions: ReimbursementSubmission[]) => {
    const balance = sharedBalance(data, user.id, appUsers.length)
    if (!submissions.length) return
    const groupId = submissions.length > 1 ? makeId('reimbursement-group') : undefined
    const prepared = submissions.map((submission) => {
      const fromId = balance < 0 ? user.id : submission.counterpartId
      const toId = balance < 0 ? submission.counterpartId : user.id
      const reimbursementId = makeId('reimbursement')
      const purchaseId = submission.settlementMethod === 'purchase' ? makeId('commissioned-purchase') : undefined
      const payerMovementId = purchaseId ? makeId('movement') : undefined
      return { submission, purchaseId, payerMovementId, reimbursement: {
        id: reimbursementId, groupId, fromId, toId,
        amount: submission.amount, date: todayISO(), authorId: user.id,
        fromAccountId: submission.fromAccountId, toAccountId: submission.toAccountId,
        settlementMethod: submission.settlementMethod,
        commissionedPurchaseId: purchaseId,
        status: cloud ? 'pending' as const : 'confirmed' as const,
      } }
    })
    if (cloud) {
      try {
        await Promise.all(prepared.flatMap((item) => item.purchaseId && item.payerMovementId ? [createCommissionedPurchase({
          id: item.purchaseId,
          recipientId: item.reimbursement.toId,
          familyId: cloud.personalMode ? undefined : cloud.familyId,
          reimbursementId: item.reimbursement.id,
          payerMovementId: item.payerMovementId,
          amount: item.submission.amount,
          purchaseDate: todayISO(),
          description: item.submission.description ?? 'Acquisto in compensazione del rimborso',
        })] : []))
      } catch {
        setToast('Non è stato possibile inviare la richiesta di compensazione')
        return
      }
    }
    setData((current) => {
      let next = { ...current, reimbursements: [...current.reimbursements, ...prepared.map((item) => item.reimbursement)] }
      for (const item of prepared) {
        if (!item.purchaseId || !item.payerMovementId || !item.submission.fromAccountId) continue
        const categoryId = `category-commissioned-${user.id}`
        const beneficiaryId = `beneficiary-contact-${item.reimbursement.toId}`
        next = saveMovementData(next, {
          id: item.payerMovementId, type: 'expense', authorId: user.id, memberId: user.id,
          amount: item.submission.amount, date: todayISO(),
          description: item.submission.description ?? 'Acquisto in compensazione del rimborso',
          categoryId, beneficiaryId, accountId: item.submission.fromAccountId,
          shared: false, commissionedPurchaseId: item.purchaseId, excludeFromReports: true,
          createdAt: new Date().toISOString(),
        }, {
          category: next.categories.some((entry) => entry.id === categoryId) ? undefined : { id: categoryId, name: 'Acquisti per conto terzi', scope: 'personal', ownerId: user.id, movementType: 'expense', color: '#687078' },
          beneficiary: next.beneficiaries.some((entry) => entry.id === beneficiaryId) ? undefined : { id: beneficiaryId, name: appUsers.find((member) => member.id === item.reimbursement.toId)?.name ?? 'Contatto', scope: 'personal', ownerId: user.id },
        })
      }
      return next
    })
    if (cloud) await refreshContacts()
    setModal(null)
    setToast(cloud
      ? `${submissions.length === 1 ? 'Rimborso inviato' : `${submissions.length} rimborsi inviati`} per conferma`
      : submissions.length === 1 ? 'Rimborso registrato' : `${submissions.length} rimborsi registrati`)
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
  const showMovements = (title: string, filter: (movement: Movement) => boolean, amount?: (movement: Movement) => number) => setModal({ type: 'details', title, filter, amount })
  const contacts = mergeContacts(
    familyContacts(appUsers, user.id, cloud?.familyName ?? 'Famiglia demo'),
    cloud ? contactData.friends : [],
  )
  const sendContactInvite = async (email: string) => {
    await inviteContact(email)
    await refreshContacts()
    setToast('Invito al contatto inviato')
  }
  const withdrawContactInvite = async (invitationId: string) => {
    await withdrawContactInvitation(invitationId)
    await refreshContacts()
    setToast('Invito ritirato')
  }
  const deleteContact = async (contact: Contact) => {
    await removeContact(contact.id)
    await refreshContacts()
    setToast(`${contact.name} rimosso dai contatti. I movimenti sono rimasti disponibili.`)
  }
  const respondToPurchase = async (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string) => {
    if (!cloud) return
    if (!accepted) {
      await respondToCommissionedPurchase({ id: purchase.id, accepted: false })
      await refreshContacts()
      setToast('Richiesta rifiutata')
      return
    }
    if (!categoryId || !accountId) throw new Error('Scegli categoria e conto personale.')
    const movementId = makeId('movement')
    await respondToCommissionedPurchase({ id: purchase.id, accepted: true, movementId, categoryId, accountId })
    const payer = contacts.find((item) => item.id === purchase.payerId)
    const beneficiaryId = `beneficiary-contact-${purchase.payerId}`
    const beneficiary = data.beneficiaries.some((item) => item.id === beneficiaryId) ? undefined : {
      id: beneficiaryId, name: payer?.name ?? 'Acquisto per mio conto', scope: 'personal' as const, ownerId: user.id,
    }
    setData((current) => saveMovementData(current, {
      id: movementId,
      type: 'expense', authorId: user.id, memberId: user.id, amount: purchase.amount,
      date: purchase.purchaseDate, description: purchase.description, categoryId,
      beneficiaryId, accountId, shared: false, affectsAccountBalance: false,
      commissionedPurchaseId: purchase.id, paidByUserId: purchase.payerId,
      createdAt: new Date().toISOString(),
    }, { beneficiary }))
    await refreshContacts()
    setToast('Acquisto confermato e catalogato')
  }
  const submitCommissionedPurchase = async (draft: CommissionedPurchaseDraft) => {
    let invitationId: string | undefined
    if (cloud && !draft.recipientId && draft.inviteEmail) {
      const result = await inviteContact(draft.inviteEmail)
      invitationId = result.invitation.id
    }
    const isFamilyMember = Boolean(draft.recipientId && appUsers.some((member) => member.id === draft.recipientId))
    if (cloud) {
      await createCommissionedPurchase({
        id: draft.id, recipientId: draft.recipientId, invitationId,
        familyId: isFamilyMember && !cloud.personalMode ? cloud.familyId : undefined,
        reimbursementId: draft.reimbursementId,
        payerMovementId: draft.movementId, amount: draft.amount,
        purchaseDate: draft.purchaseDate, description: draft.description,
      })
      await refreshContacts()
    }
    if (draft.reimbursementId && draft.recipientId) {
      const reimbursement: Reimbursement = {
        id: draft.reimbursementId,
        fromId: user.id,
        toId: draft.recipientId,
        amount: draft.amount,
        date: draft.purchaseDate,
        authorId: user.id,
        fromAccountId: draft.accountId,
        settlementMethod: 'purchase',
        commissionedPurchaseId: draft.id,
        status: cloud ? 'pending' : 'confirmed',
      }
      setData((current) => current.reimbursements.some((item) => item.id === reimbursement.id)
        ? current
        : { ...current, reimbursements: [...current.reimbursements, reimbursement] })
    }
  }

  const common = { data, user, onShowMovements: showMovements }
  const content = page === 'dashboard' ? <Dashboard data={data} user={user} members={appUsers} onNavigate={setPage} onReimburse={() => setModal({ type: 'reimburse' })} onRespondReimbursement={cloud ? respondToReimbursement : undefined} workspace={cloud ? {
    familyId: cloud.familyId,
    families: cloud.families,
    personalMode: cloud.personalMode,
    onSwitch: cloud.switchFamily,
  } : undefined} />
    : page === 'movements' ? <MovementsPage data={data} user={user} onEdit={(movement) => setModal({ type: 'movement', movement })} onDelete={deleteMovement} />
    : page === 'scheduled' ? <ScheduledPaymentsPage data={data} user={user} />
    : page === 'reimbursements' ? <ReimbursementsPage data={data} user={user} members={appUsers} onRespond={cloud ? respondToReimbursement : undefined} />
    : page === 'accounts' ? <AccountsPage {...common} families={cloud?.families ?? []} activeFamilyId={cloud?.personalMode ? undefined : cloud?.familyId} onAdd={async (account, familyId) => {
      if (cloud && account.scope === 'family') {
        if (!familyId) throw new Error('Scegli la famiglia del conto.')
        await cloud.createSharedAccount(account, familyId)
        setToast(`Conto condiviso creato in ${cloud.families.find((family) => family.id === familyId)?.name ?? 'famiglia'}`)
        return
      }
      setData((current) => ({ ...current, accounts: [...current.accounts, account] }))
      setToast('Conto personale creato')
    }} onUpdate={updateAccount} reimbursementSharing={cloud ? {
      references: cloud.reimbursementAccountReferences,
      onChange: async (account, familyIds) => {
        try {
          await cloud.setReimbursementAccountFamilies(account, familyIds)
          setToast(familyIds.length ? `Conto visibile in ${familyIds.length} ${familyIds.length === 1 ? 'famiglia' : 'famiglie'}` : 'Conto rimosso dalle scelte dei rimborsi')
        } catch {
          setToast('Non è stato possibile aggiornare la visibilità del conto')
        }
      },
    } : undefined} />
    : page === 'categories' ? <CategoriesPage {...common} onAdd={(category) => setData((current) => ({ ...current, categories: [...current.categories, category] }))} onUpdate={(category) => setData((current) => ({ ...current, categories: current.categories.map((item) => item.id === category.id ? category : item) }))} onDelete={(id, replacementId) => deleteDirectory('category', id, replacementId)} />
    : page === 'beneficiaries' ? <BeneficiariesPage {...common} onAddBeneficiary={(beneficiary: Beneficiary) => setData((current) => ({ ...current, beneficiaries: [...current.beneficiaries, beneficiary] }))} onUpdateBeneficiary={(beneficiary) => {
      setData((current) => ({ ...current, beneficiaries: current.beneficiaries.map((item) => item.id === beneficiary.id ? beneficiary : item) }))
      setToast('Beneficiario aggiornato in tutti i movimenti')
    }} onDeleteBeneficiary={(id, replacementId) => deleteDirectory('beneficiary', id, replacementId)} onAddSender={(sender: Sender) => setData((current) => ({ ...current, senders: [...current.senders, sender] }))} onUpdateSender={(sender) => {
      setData((current) => ({ ...current, senders: current.senders.map((item) => item.id === sender.id ? sender : item) }))
      setToast('Mittente aggiornato in tutti i movimenti')
    }} onDeleteSender={(id, replacementId) => deleteDirectory('sender', id, replacementId)} />
    : page === 'tags' ? <TagsPage {...common} onAdd={(tag) => setData((current) => ({ ...current, tags: [...current.tags, tag] }))} onUpdate={(tag) => setData((current) => ({ ...current, tags: current.tags.map((item) => item.id === tag.id ? tag : item) }))} onAddReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.includes(tagId) ? current.tagReportIds : [...current.tagReportIds, tagId] }))} onRemoveReport={(tagId) => setData((current) => ({ ...current, tagReportIds: current.tagReportIds.filter((id) => id !== tagId) }))} />
    : page === 'contacts' && cloud ? <ContactsPage data={data} user={user} contacts={contacts} invitations={contactData.invitations} purchases={contactData.purchases} onInvite={sendContactInvite} onWithdrawInvitation={withdrawContactInvite} onRemove={deleteContact} onRespond={respondToPurchase} onShowMovements={showMovements} />
    : page === 'guide' ? <GuidePage />
    : <AccountSettings user={user} cloud={cloud} />

  const detailMovements = modal?.type === 'details' ? visibleMovements(data, user.id).filter(modal.filter).toSorted((a, b) => b.date.localeCompare(a.date)) : []
  const detailTotal = modal?.type === 'details'
    ? detailMovements.reduce((sum, movement) => sum + (modal.amount?.(movement) ?? movement.amount), 0)
    : 0
  return <>
    <AppShell page={page} user={user} registeredUserCount={cloud ? cloud.registeredUserCount : appUsers.length} contactsEnabled={Boolean(cloud)} onPageChange={setPage} onAddMovement={() => setModal({ type: 'movement' })} onLogout={logout}>
      <Suspense fallback={<FeatureLoading />}>{content}</Suspense>
    </AppShell>
    {modal?.type === 'movement' ? <Modal title={modal.movement ? 'Modifica movimento' : 'Nuovo movimento'} onClose={() => setModal(null)} wide><Suspense fallback={<FeatureLoading compact />}><MovementForm data={data} user={user} memberCount={appUsers.length} familyName={cloud?.familyName} initial={modal.movement} initialType={modal.initialType} personalOnly={cloud?.personalMode} contacts={contacts} members={appUsers} onCommissionedPurchase={modal.movement ? undefined : submitCommissionedPurchase} onSelectTransfer={modal.movement ? undefined : () => setModal({ type: 'transfer' })} onSave={saveMovement} onDelete={deleteMovement} onCancel={() => setModal(null)} /></Suspense></Modal> : null}
    {modal?.type === 'reimburse' ? <Modal title="Registra rimborso" onClose={() => setModal(null)}><ReimbursementForm data={data} userId={user.id} members={appUsers} accountReferences={cloud?.reimbursementAccountReferences.filter((reference) => reference.familyId === cloud.familyId) ?? []} requireConfirmation={Boolean(cloud)} onSubmit={registerReimbursement} onCancel={() => setModal(null)} /></Modal> : null}
    {modal?.type === 'transfer' ? <Modal title="Nuovo movimento" onClose={() => setModal(null)}><Suspense fallback={<FeatureLoading compact />}><TransferForm data={data} user={user} memberCount={appUsers.length} onSelectMovement={(initialType) => setModal({ type: 'movement', initialType })} onSubmit={saveTransfer} onCancel={() => setModal(null)} /></Suspense></Modal> : null}
    {modal?.type === 'details' ? <Modal title={modal.title} onClose={() => setModal(null)} wide><div className="movement-detail-summary"><span>Totale <strong>{formatMoney(detailTotal)}</strong></span>{detailMovements.length ? <span>dal <strong>{formatDate(detailMovements[detailMovements.length - 1].date)}</strong></span> : null}</div><Suspense fallback={<FeatureLoading compact />}><MovementList data={data} movements={detailMovements} compact /></Suspense></Modal> : null}
    {toast ? <div className="toast" role="status"><CheckCircle2 />{toast}</div> : null}
  </>
}

function FeatureLoading({ compact = false }: { compact?: boolean }) {
  return <div className={`feature-loading ${compact ? 'feature-loading--compact' : ''}`} role="status"><LoaderCircle className="spin" />Caricamento…</div>
}

function cloudImportKey(familyId: string, userId: string) {
  return `valar-morghulis:cloud-imported:${familyId}:${userId}:v1`
}

function mergeContacts(family: Contact[], friends: Contact[]) {
  const merged = new Map<string, Contact>()
  for (const contact of [...friends, ...family]) {
    const current = merged.get(contact.id)
    merged.set(contact.id, current && contact.source === 'family'
      ? { ...contact, familyNames: [...new Set([...(current.familyNames ?? []), ...(contact.familyNames ?? [])])] }
      : current ?? contact)
  }
  return [...merged.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'it'))
}

function ReimbursementForm(props: {
  data: AppData
  userId: UserId
  members: User[]
  accountReferences: ReimbursementAccountReference[]
  requireConfirmation: boolean
  onSubmit: (submissions: ReimbursementSubmission[]) => Promise<void>
  onCancel: () => void
}) {
  const balance = sharedBalance(props.data, props.userId, props.members.length)
  if (props.members.length > 2 && balance < 0) return <MultiMemberReimbursementForm {...props} />
  if (props.members.length > 2) return <div className="reimbursement-form"><span className="reimbursement-form__icon"><CheckCircle2 /></span><p>Rimborso non necessario</p><small>Nelle famiglie con più membri il rimborso viene avviato dalla persona che deve saldare il proprio debito.</small><div className="form-actions"><button className="button button--primary" type="button" onClick={props.onCancel}>Chiudi</button></div></div>
  return <TwoMemberReimbursementForm {...props} />
}

function MultiMemberReimbursementForm({ data, userId, members, accountReferences, requireConfirmation, onSubmit, onCancel }: {
  data: AppData
  userId: UserId
  members: User[]
  accountReferences: ReimbursementAccountReference[]
  requireConfirmation: boolean
  onSubmit: (submissions: ReimbursementSubmission[]) => Promise<void>
  onCancel: () => void
}) {
  const plan = reimbursementPlan(data, userId, members.map((member) => member.id))
  const ownAccounts = data.accounts.filter((item) => item.scope === 'personal' && item.ownerId === userId)
  const [fromAccountId, setFromAccountId] = useState(ownAccounts[0]?.id ?? '')
  const [selections, setSelections] = useState<Record<string, MultiReimbursementSelection>>(() => Object.fromEntries(plan.map((item) => [item.memberId, {
    selected: true,
    amount: item.suggestedAmount.toFixed(2).replace('.', ','),
    toAccountId: accountReferences.find((account) => account.ownerId === item.memberId)?.accountId ?? '',
    settlementMethod: 'money',
    description: '',
  }])))
  const parsed = plan.map((item) => {
    const selection = selections[item.memberId]
    const amount = Number((selection?.amount ?? '').replace(',', '.'))
    return { ...item, ...selection, amount: Number.isFinite(amount) ? amount : 0 }
  })
  const selected = parsed.filter((item) => item.selected && item.amount > 0)
  const total = selected.reduce((sum, item) => sum + item.amount, 0)
  const maximumTotal = plan.reduce((sum, item) => sum + item.suggestedAmount, 0)
  const valid = selected.length > 0
    && total <= maximumTotal + 0.001
    && selected.every((item) => item.amount <= item.availableCredit + 0.001)
    && selected.every((item) => item.settlementMethod === 'money' || Boolean(fromAccountId && item.description.trim()))
  const update = (memberId: string, value: Partial<{ selected: boolean; amount: string; toAccountId: string; settlementMethod: 'money' | 'purchase'; description: string }>) => {
    setSelections((current) => ({ ...current, [memberId]: { ...current[memberId], ...value } }))
  }

  return <form className="reimbursement-form reimbursement-form--multi" onSubmit={(event) => {
    event.preventDefault()
    if (!valid) return
    void onSubmit(selected.map((item) => ({
      amount: item.amount,
      fromAccountId: fromAccountId || undefined,
      toAccountId: item.settlementMethod === 'money' ? item.toAccountId || undefined : undefined,
      counterpartId: item.memberId,
      settlementMethod: item.settlementMethod,
      description: item.description,
    })))
  }}>
    <span className="reimbursement-form__icon"><Scale /></span>
    <p>Ripartisci il rimborso</p>
    <strong>Da rimborsare: {formatMoney(maximumTotal)}</strong>
    <small>Scegli uno o più membri creditori. Ogni persona confermerà soltanto il rimborso che la riguarda.</small>
    <label>Il tuo conto di origine<select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}><option value="">Nessun conto selezionato</option>{ownAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.institution}</option>)}</select></label>
    <div className="reimbursement-recipients">
      {plan.map((item) => {
        const member = members.find((candidate) => candidate.id === item.memberId)
        const accounts = accountReferences.filter((account) => account.ownerId === item.memberId)
        const selection = selections[item.memberId]
        return <fieldset key={item.memberId} className={selection?.selected ? 'reimbursement-recipient reimbursement-recipient--selected' : 'reimbursement-recipient'}>
          <label className="reimbursement-recipient__toggle"><input type="checkbox" checked={selection?.selected ?? false} onChange={(event) => update(item.memberId, { selected: event.target.checked })} /><span><strong>{member?.name ?? 'Membro'}</strong><small>Credito disponibile: {formatMoney(item.availableCredit)}</small></span></label>
          {selection?.selected ? <div className="reimbursement-recipient__fields">
            <label>Importo<div className="money-input"><span>€</span><input value={selection.amount} inputMode="decimal" onChange={(event) => update(item.memberId, { amount: event.target.value })} /></div></label>
            <label>Modalità<select value={selection.settlementMethod} onChange={(event) => update(item.memberId, { settlementMethod: event.target.value as 'money' | 'purchase' })}><option value="money">Rimborso in denaro</option><option value="purchase">Compensa con un acquisto</option></select></label>
            {selection.settlementMethod === 'purchase' ? <label>Descrizione dell’acquisto<input value={selection.description} onChange={(event) => update(item.memberId, { description: event.target.value })} required /></label> : <label>Conto di destinazione<select value={selection.toAccountId} onChange={(event) => update(item.memberId, { toAccountId: event.target.value })}><option value="">Lo specifica il destinatario</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>)}</select></label>}
          </div> : null}
        </fieldset>
      })}
    </div>
    {!plan.length ? <p className="privacy-note">Non risultano crediti disponibili da rimborsare oppure sono già presenti rimborsi in attesa.</p> : null}
    {!valid && selected.length ? <p className="form-error">Gli importi non possono superare il debito totale o il credito disponibile del destinatario.</p> : null}
    <p className="privacy-note">I rimborsi sono separati e aggiornano i saldi soltanto dopo le rispettive conferme.</p>
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={!valid}>{requireConfirmation ? 'Invia per conferma' : 'Registra rimborsi'} <ArrowRight /></button></div>
  </form>
}

function TwoMemberReimbursementForm({ data, userId, members, accountReferences, requireConfirmation, onSubmit, onCancel }: {
  data: AppData
  userId: UserId
  members: User[]
  accountReferences: ReimbursementAccountReference[]
  requireConfirmation: boolean
  onSubmit: (submissions: ReimbursementSubmission[]) => Promise<void>
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
  const [settlementMethod, setSettlementMethod] = useState<'money' | 'purchase'>('money')
  const [purchaseDescription, setPurchaseDescription] = useState('')
  const destinationAccount = data.accounts.find((item) => item.id === toAccountId)
  const label = balance < 0 ? `Tu rimborsi ${other.name}` : `${other.name} rimborsa te`
  const canUsePurchase = balance < 0
  const canSubmit = Boolean(counterpartId && (settlementMethod === 'money' || (fromAccountId && purchaseDescription.trim())))
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
    if (value > 0 && canSubmit) void onSubmit([{ amount: value, fromAccountId, toAccountId: settlementMethod === 'money' ? toAccountId : undefined, counterpartId, settlementMethod, description: purchaseDescription.trim() || undefined }])
  }}>
    <span className="reimbursement-form__icon"><Scale /></span>
    <p>{label}</p>
    <strong>Saldo attuale: {formatMoney(Math.abs(balance))}</strong>
    {counterparts.length > 1 ? <label>Altro membro coinvolto<select value={counterpartId} onChange={(event) => selectCounterpart(event.target.value)} required>{counterparts.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label> : null}
    <label>Importo del rimborso<div className="money-input"><span>€</span><input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} autoFocus required /></div></label>
    {canUsePurchase ? <label>Modalità<select value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value as 'money' | 'purchase')}><option value="money">Rimborso in denaro</option><option value="purchase">Compensa con un acquisto</option></select></label> : null}
    <label>Conto di origine del debitore<select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}><option value="">Conto da specificare dal debitore</option>{debtorAccounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {settlementMethod === 'purchase' ? <label>Descrizione dell’acquisto<input value={purchaseDescription} onChange={(event) => setPurchaseDescription(event.target.value)} placeholder="Es. scarpe acquistate per Anna" required /></label> : <label>Conto di destinazione<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">Conto da specificare dal creditore</option>{creditorAccounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    {settlementMethod === 'purchase' ? <small>L’acquisto resta fuori dalle tue statistiche personali. {other.name} dovrà confermarlo e scegliere la propria categoria.</small> : destinationAccount?.scope === 'family' ? <small>Il conto di destinazione è condiviso: il rimborso compensa soltanto la quota che appartiene agli altri {members.length - 1} membri.</small> : balance > 0 ? <small>Stai registrando il rimborso come creditore: specifica sia il conto di origine di {other.name}, sia il tuo conto di destinazione.</small> : <small>Specifica il tuo conto di origine e il conto di destinazione di {other.name}. Il pagamento non viene eseguito dall’app: viene registrata soltanto la compensazione.</small>}
    <p className="privacy-note">Degli altri membri sono visibili soltanto i nomi dei conti autorizzati. Saldi, istituti e movimenti restano privati.</p>
    {requireConfirmation ? <p className="privacy-note">Il rimborso aggiornerà i saldi solo dopo la conferma dell’altro membro, che potrà completare il proprio conto se manca.</p> : null}
    <div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={!canSubmit}>{requireConfirmation ? 'Invia per conferma' : 'Registra rimborso'} <ArrowRight /></button></div>
  </form>
}
