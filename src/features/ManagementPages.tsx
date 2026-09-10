import { Building2, Check, ChevronRight, CreditCard, Eye, Landmark, LockKeyhole, Plus, Send, Share2, Tag as TagIcon, Trash2, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { ActionMenu } from '../components/ActionMenu'
import { CreatableLookup } from '../components/CreatableLookup'
import { DonutChart } from '../components/DonutChart'
import { accountHasReciprocalOperations, accountLinkedOperationCount, accountReplacementCreatesInvalidTransfer, type AccountDeletionMode } from '../lib/accounts'
import { accountBalance, movementAllocations, visibleMovements } from '../lib/calculations'
import { formatDate, formatMoney, makeId, todayISO } from '../lib/format'
import type { Account, AppData, Beneficiary, Category, Movement, MovementType, ReimbursementAccountReference, Sender, Tag, User } from '../types'

interface BaseProps {
  data: AppData
  user: User
  onShowMovements: (
    title: string,
    filter: (movement: AppData['movements'][number]) => boolean,
    amount?: (movement: AppData['movements'][number]) => number,
    accountId?: string,
    transferFilter?: (transfer: AppData['transfers'][number]) => boolean,
    transferAmount?: (transfer: AppData['transfers'][number]) => number,
  ) => void
}

const byName = <T extends { name: string }>(left: T, right: T) => left.name.localeCompare(right.name, 'it-IT', { sensitivity: 'base', numeric: true })

export function AccountsPage({ data, user, onAdd, onUpdate, onDelete, onShowMovements, families = [], activeFamilyId, canDeleteFamilyAccounts = false, reimbursementSharing }: BaseProps & {
  onAdd: (account: Account, familyId?: string) => void | Promise<void>
  onUpdate: (account: Account) => void
  onDelete: (account: Account, mode: AccountDeletionMode, replacementAccountId?: string) => void | Promise<void>
  families?: Array<{ id: string; name: string }>
  activeFamilyId?: string
  canDeleteFamilyAccounts?: boolean
  reimbursementSharing?: {
    references: ReimbursementAccountReference[]
    onChange: (account: Account, familyIds: string[]) => Promise<void>
  }
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [balance, setBalance] = useState('')
  const [balanceDate, setBalanceDate] = useState(todayISO())
  const [type, setType] = useState<Account['type']>('bank')
  const [scope, setScope] = useState<Account['scope']>('personal')
  const [targetFamilyId, setTargetFamilyId] = useState(activeFamilyId ?? families[0]?.id ?? '')
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [editingAccountId, setEditingAccountId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [editingInstitution, setEditingInstitution] = useState('')
  const [editingType, setEditingType] = useState<Account['type']>('bank')
  const [editingBalance, setEditingBalance] = useState('')
  const [editingBalanceDate, setEditingBalanceDate] = useState(todayISO())
  const [sharingAccountId, setSharingAccountId] = useState('')
  const [sharingError, setSharingError] = useState('')
  const [deletingAccountId, setDeletingAccountId] = useState('')
  const [deletionMode, setDeletionMode] = useState<AccountDeletionMode>('keep')
  const [replacementAccountId, setReplacementAccountId] = useState('')
  const [deletionBusy, setDeletionBusy] = useState(false)
  const [deletionError, setDeletionError] = useState('')
  const accounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const deletingAccount = accounts.find((item) => item.id === deletingAccountId)
  const replacementAccounts = deletingAccount ? accounts.filter((item) => item.id !== deletingAccount.id
    && item.scope === deletingAccount.scope
    && (item.type === 'welfare') === (deletingAccount.type === 'welfare')) : []
  const linkedOperationCount = deletingAccount ? accountLinkedOperationCount(data, deletingAccount.id) : 0
  const hasReciprocalOperations = deletingAccount ? accountHasReciprocalOperations(data, deletingAccount.id) : false
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim()) return
    if (scope === 'family' && families.length && !targetFamilyId) { setFormError('Scegli la famiglia del conto.'); return }
    if (type === 'welfare' && scope === 'family') { setFormError('Un conto Wellfare deve essere personale.'); return }
    setFormBusy(true); setFormError('')
    try {
      await onAdd({ id: globalThis.crypto?.randomUUID?.() ?? makeId('account'), ownerId: scope === 'personal' ? user.id : undefined, name: name.trim(), institution: institution.trim() || (scope === 'family' ? 'Conto condiviso' : 'Conto personale'), type, scope, openingBalance: Number(balance.replace(',', '.')) || 0, openingBalanceDate: balanceDate }, scope === 'family' ? targetFamilyId : undefined)
      setName(''); setInstitution(''); setBalance(''); setBalanceDate(todayISO()); setShowForm(false)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Non è stato possibile creare il conto.')
    } finally { setFormBusy(false) }
  }
  const startEditing = (account: Account) => {
    setEditingAccountId(account.id)
    setEditingName(account.name)
    setEditingInstitution(account.institution)
    setEditingType(account.type)
    setEditingBalance(account.openingBalance.toFixed(2).replace('.', ','))
    setEditingBalanceDate(account.openingBalanceDate ?? todayISO())
  }
  const updateAccountDetails = (event: React.FormEvent) => {
    event.preventDefault()
    const account = data.accounts.find((item) => item.id === editingAccountId)
    if (!account || !editingName.trim() || !editingBalanceDate) return
    const numericBalance = Number(editingBalance.replace(',', '.'))
    if (!Number.isFinite(numericBalance)) return
    onUpdate({ ...account, name: editingName.trim(), institution: editingInstitution.trim(), type: editingType, openingBalance: numericBalance, openingBalanceDate: editingBalanceDate })
    setEditingAccountId('')
  }
  const confirmAccountDeletion = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!deletingAccount) return
    if (deletionMode === 'reassign' && !replacementAccountId) {
      setDeletionError('Scegli il conto al quale ricondurre i movimenti.')
      return
    }
    if (deletionMode === 'reassign' && accountReplacementCreatesInvalidTransfer(data, deletingAccount.id, replacementAccountId)) {
      setDeletionError('Questo conto è la controparte di un giro fondi collegato. Scegli un altro conto per evitare un trasferimento verso lo stesso conto.')
      return
    }
    if (deletionMode !== 'keep' && accountHasReciprocalOperations(data, deletingAccount.id)) {
      setDeletionError('Questo conto è collegato a rimborsi, prestiti o acquisti per un’altra persona. Per non modificare unilateralmente operazioni reciproche, mantieni lo storico oppure rettifica prima quelle operazioni.')
      return
    }
    setDeletionBusy(true); setDeletionError('')
    try {
      await onDelete(deletingAccount, deletionMode, deletionMode === 'reassign' ? replacementAccountId : undefined)
      setDeletingAccountId(''); setDeletionMode('keep'); setReplacementAccountId('')
    } catch (reason) {
      setDeletionError(reason instanceof Error ? reason.message : 'Non è stato possibile eliminare il conto.')
    } finally { setDeletionBusy(false) }
  }
  return <div className="page accounts-page"><div className="page-heading accounts-heading"><div><h1>Conti</h1><p>Conti personali, condivisi e disponibilità liquide.</p></div><div className="heading-actions"><button className="button button--primary" onClick={() => setShowForm(true)}><Plus />Aggiungi conto</button></div></div>
    {showForm ? <InlineForm title="Nuovo conto" submitLabel={formBusy ? 'Creazione…' : 'Crea conto'} onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome conto<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Conto principale" autoFocus /></label><label>{type === 'cash' ? 'Dettaglio' : 'Istituto'}<input value={institution} onChange={(e) => setInstitution(e.target.value)} /></label><label>Tipo<select value={type} onChange={(e) => { const next = e.target.value as Account['type']; setType(next); if (next === 'welfare') setScope('personal') }}><option value="bank">Conto bancario</option><option value="credit">Carta di credito</option><option value="cash">Contanti</option><option value="paypal">PayPal</option><option value="welfare">Wellfare</option></select></label><label>Visibilità<select value={scope} disabled={type === 'welfare'} onChange={(e) => setScope(e.target.value as Account['scope'])}><option value="personal">Personale</option>{families.length ? <option value="family">Condiviso con una famiglia</option> : null}</select>{type === 'welfare' ? <small>Le tessere e i buoni aziendali restano personali.</small> : null}</label>{scope === 'family' ? <label>Famiglia<select aria-label="Famiglia del conto" value={targetFamilyId} onChange={(event) => setTargetFamilyId(event.target.value)} required>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label> : null}<label>Saldo iniziale<input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></label><label>Data del saldo iniziale<input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} required /></label>{formError ? <p className="form-message form-message--error" role="alert">{formError}</p> : null}</InlineForm> : null}
    {editingAccountId ? <InlineForm title="Modifica conto" submitLabel="Salva modifiche" onSubmit={updateAccountDetails} onCancel={() => setEditingAccountId('')}><label>Nome conto<input value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus required /></label><label>{editingType === 'cash' ? 'Dettaglio' : 'Istituto'}<input value={editingInstitution} onChange={(e) => setEditingInstitution(e.target.value)} /></label><label>Tipo<select value={editingType} onChange={(e) => setEditingType(e.target.value as Account['type'])}><option value="bank">Conto bancario</option><option value="credit">Carta di credito</option><option value="cash">Contanti</option><option value="paypal">PayPal</option><option value="welfare" disabled={data.accounts.find((item) => item.id === editingAccountId)?.scope === 'family'}>Wellfare</option></select></label><label>Saldo iniziale<input inputMode="decimal" value={editingBalance} onChange={(e) => setEditingBalance(e.target.value)} required /></label><label>Data di riferimento<input type="date" value={editingBalanceDate} onChange={(e) => setEditingBalanceDate(e.target.value)} required /></label><p className="field-explanation">I movimenti precedenti a questa data possono restare solo nelle statistiche, senza modificare il saldo calcolato.</p></InlineForm> : null}
    {deletingAccount ? <form className="account-delete-form" onSubmit={(event) => void confirmAccountDeletion(event)}>
      <div><strong>Elimina {deletingAccount.name}</strong><p>{linkedOperationCount ? `${linkedOperationCount} operazioni sono collegate a questo conto.` : 'Nessuna operazione è collegata a questo conto.'}</p></div>
      <fieldset><legend>Come gestire i movimenti</legend>
        <label><input type="radio" name="account-deletion-mode" checked={deletionMode === 'keep'} onChange={() => { setDeletionMode('keep'); setDeletionError('') }} /> Mantieni i movimenti nello storico</label>
        <label><input type="radio" name="account-deletion-mode" checked={deletionMode === 'delete'} disabled={hasReciprocalOperations} onChange={() => { setDeletionMode('delete'); setDeletionError('') }} /> Elimina tutti i movimenti collegati</label>
        <label><input type="radio" name="account-deletion-mode" checked={deletionMode === 'reassign'} disabled={!replacementAccounts.length || hasReciprocalOperations} onChange={() => { setDeletionMode('reassign'); setDeletionError('') }} /> Riconduci i movimenti a un altro conto</label>
      </fieldset>
      {hasReciprocalOperations ? <p className="field-explanation">Il conto partecipa a operazioni reciproche: può essere eliminato conservandole nello storico, oppure dopo averle rettificate dalla sezione Rimborsi e prestiti.</p> : null}
      {deletionMode === 'reassign' ? <label>Conto di destinazione<select aria-label="Conto al quale ricondurre i movimenti" value={replacementAccountId} onChange={(event) => { setReplacementAccountId(event.target.value); setDeletionError('') }} required><option value="">Scegli un conto</option>{replacementAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
      <p className="field-explanation">{deletionMode === 'keep' ? 'Le operazioni restano consultabili negli altri elenchi con l’indicazione “Conto eliminato”.' : deletionMode === 'delete' ? 'Verranno eliminati anche rate, giro fondi e altre registrazioni contabili che usano questo conto.' : 'Le operazioni manterranno importi e date, ma useranno il nuovo conto per saldi e storico.'}</p>
      {deletionError ? <p className="form-message form-message--error" role="alert">{deletionError}</p> : null}
      <div className="account-delete-form__actions"><button type="button" className="button button--ghost" disabled={deletionBusy} onClick={() => { setDeletingAccountId(''); setDeletionMode('keep'); setReplacementAccountId(''); setDeletionError('') }}>Annulla</button><button type="submit" className="button button--danger" disabled={deletionBusy}>{deletionBusy ? 'Eliminazione…' : 'Elimina conto'}</button></div>
    </form> : null}
    {reimbursementSharing ? <p className="field-explanation reimbursement-privacy-note"><LockKeyhole /> Per ogni conto personale scegli in quali famiglie renderne visibile soltanto il nome. Saldo, istituto e movimenti restano privati.</p> : null}
    {sharingError ? <p className="form-message form-message--error" role="alert">{sharingError}</p> : null}
    <div className="management-list">{accounts.map((account) => {
      const selectedFamilyIds = reimbursementSharing?.references.filter((item) => item.ownerId === user.id && item.accountId === account.id).map((item) => item.familyId) ?? []
      const sharedFamilyName = families.find((family) => family.id === activeFamilyId)?.name
      return <article className="management-row" key={account.id}><span className="management-row__icon">{account.type === 'bank' ? <Landmark /> : account.type === 'credit' || account.type === 'paypal' ? <CreditCard /> : <WalletCards />}</span><div className="management-row__info"><strong>{account.name}{selectedFamilyIds.length ? <Eye aria-label="Visibile per i rimborsi" /> : null}</strong><small>{account.institution} · {account.type === 'welfare' ? 'Wellfare · ' : ''}{account.scope === 'family' ? `Condiviso con ${sharedFamilyName ?? 'la famiglia'}` : 'Personale'}</small><small>Saldo iniziale {formatMoney(account.openingBalance)}{account.openingBalanceDate ? ` · ${formatDate(account.openingBalanceDate)}` : ''}</small>{account.scope === 'personal' && reimbursementSharing ? <fieldset className="account-family-sharing"><legend>Visibile per i rimborsi in</legend>{families.map((family) => {
        return <label key={family.id} className="account-sharing-toggle"><input type="checkbox" checked={selectedFamilyIds.includes(family.id)} disabled={sharingAccountId === account.id} onChange={(event) => {
          const nextFamilyIds = event.target.checked ? [...selectedFamilyIds, family.id] : selectedFamilyIds.filter((familyId) => familyId !== family.id)
          setSharingAccountId(account.id)
          setSharingError('')
          void reimbursementSharing.onChange(account, nextFamilyIds)
            .catch((reason) => setSharingError(reason instanceof Error ? reason.message : 'Non è stato possibile aggiornare la visibilità del conto.'))
            .finally(() => setSharingAccountId(''))
        }} /> {family.name}</label>
      })}</fieldset> : null}</div><div className="management-row__value"><small>Saldo calcolato</small><b className={accountBalance(data, account.id) < 0 ? 'negative-text' : ''}>{formatMoney(accountBalance(data, account.id))}</b></div><div className="management-row__actions"><ActionMenu label={`Azioni per ${account.name}`} items={[{ label: 'Modifica conto', disabled: account.scope === 'family' && !canDeleteFamilyAccounts, onSelect: () => startEditing(account) }, { label: 'Elimina conto', danger: true, disabled: deletionBusy || (account.scope === 'family' && !canDeleteFamilyAccounts), onSelect: () => { setDeletingAccountId(account.id); setDeletionMode('keep'); setReplacementAccountId(''); setDeletionError(''); setEditingAccountId('') } }]} /><button className="row-disclosure" type="button" aria-label={`Vedi movimenti di ${account.name}`} onClick={() => onShowMovements(`Movimenti · ${account.name}`, (movement) => movement.accountId === account.id || movement.welfareAccountId === account.id, undefined, account.id)}><ChevronRight /></button></div></article>
    })}</div>
  </div>
}

export function CategoriesPage({ data, user, onAdd, onUpdate, onDelete, onShowMovements }: BaseProps & {
  onAdd: (category: Category) => void
  onUpdate: (category: Category) => void
  onDelete: (categoryId: string, replacementId?: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'family' | 'personal'>('family')
  const [movementType, setMovementType] = useState<MovementType>('expense')
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [replacementQuery, setReplacementQuery] = useState('')
  const [budgetId, setBudgetId] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const categories = data.categories.filter((item) => item.scope === 'family' || item.ownerId === user.id).toSorted(byName)
  const unassignedMovements = visibleMovements(data, user.id).filter((movement) =>
    movementAllocations(movement).some((allocation) => !allocation.categoryId))
  const deletingItem = categories.find((item) => item.id === deletingId)
  const replacements = categories.filter((item) => item.id !== deletingId
    && item.movementType === deletingItem?.movementType
    && (deletingItem?.scope !== 'family' || item.scope === 'family'))
  const affectedCount = deletingItem
    ? data.movements.filter((movement) => movementAllocations(movement).some((allocation) => allocation.categoryId === deletingItem.id)).length
      + data.scheduledPayments.filter((payment) => movementAllocations(payment).some((allocation) => allocation.categoryId === deletingItem.id)).length
    : 0
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onAdd({ id: makeId('category'), name: name.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined, movementType, color: movementType === 'income' ? '#3f7650' : '#c64e2f' })
    setName('')
    setShowForm(false)
  }
  const saveName = (item: Category) => {
    if (!editingName.trim()) return
    onUpdate({ ...item, name: editingName.trim() })
    setEditingId('')
    setEditingName('')
  }
  const budgetItem = categories.find((item) => item.id === budgetId)
  const saveBudget = (event: React.FormEvent) => {
    event.preventDefault()
    if (!budgetItem) return
    const value = Math.round((Number(budgetAmount.replace(',', '.')) || 0) * 100) / 100
    if (value <= 0) return
    onUpdate({ ...budgetItem, monthlyBudget: value })
    setBudgetId('')
    setBudgetAmount('')
  }
  const showCategoryMovements = (item: Category) => onShowMovements(
    `Movimenti · ${item.name}`,
    (movement) => movementAllocations(movement).some((allocation) => allocation.categoryId === item.id),
    (movement) => movementAllocations(movement).filter((allocation) => allocation.categoryId === item.id).reduce((sum, allocation) => sum + allocation.amount, 0),
    undefined,
    (transfer) => transfer.feeCategoryId === item.id && Boolean(transfer.feeAmount),
    (transfer) => transfer.feeAmount ?? 0,
  )
  return <DirectoryPage title="Categorie" subtitle="Categorie distinte per spese ed entrate." addLabel="Nuova categoria" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuova categoria" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label>Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value as MovementType)}><option value="expense">Spesa</option><option value="income">Entrata</option></select></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    {deletingItem ? <form className="directory-delete-form" onSubmit={(event) => { event.preventDefault(); const match = replacements.find((item) => item.name.toLocaleLowerCase('it-IT') === replacementQuery.trim().toLocaleLowerCase('it-IT')); const created = replacementQuery.trim() && !match ? { id: makeId('category'), name: replacementQuery.trim(), scope: deletingItem.scope, ownerId: deletingItem.scope === 'personal' ? user.id : undefined, movementType: deletingItem.movementType, color: deletingItem.color } : undefined; if (created) onAdd(created); onDelete(deletingItem.id, (created?.id ?? match?.id ?? replacementId) || undefined); setDeletingId(''); setReplacementId(''); setReplacementQuery('') }}>
      <div><strong>Elimina {deletingItem.name}</strong><p>{affectedCount ? `${affectedCount} movimenti o rate usano questa categoria.` : 'Questa categoria non è utilizzata.'}</p></div>
      <CreatableLookup label="Attribuisci i movimenti a" value={replacementQuery} options={replacements} placeholder="Senza categoria" onChange={(value) => { setReplacementQuery(value); setReplacementId(replacements.find((item) => item.name.toLocaleLowerCase('it-IT') === value.trim().toLocaleLowerCase('it-IT'))?.id ?? '') }} />
      <div><button type="button" className="button button--ghost" onClick={() => { setDeletingId(''); setReplacementId(''); setReplacementQuery('') }}>Annulla</button><button type="submit" className="button button--danger"><Trash2 />Elimina</button></div>
    </form> : null}
    {budgetItem ? <form className="directory-budget-form" onSubmit={saveBudget}><div><strong>Budget mensile · {budgetItem.name}</strong><p>{budgetItem.scope === 'family' ? 'I movimenti condivisi di tutta la famiglia concorrono al totale.' : 'Concorrono soltanto i tuoi movimenti personali.'}</p></div><label>Importo mensile<div className="money-input"><span>€</span><input aria-label={`Budget mensile ${budgetItem.name}`} inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} autoFocus /></div></label><div>{budgetItem.monthlyBudget ? <button type="button" className="button button--ghost button--danger" onClick={() => { onUpdate({ ...budgetItem, monthlyBudget: undefined, budgetCarryovers: undefined }); setBudgetId(''); setBudgetAmount('') }}>Rimuovi budget</button> : null}<button type="button" className="button button--ghost" onClick={() => { setBudgetId(''); setBudgetAmount('') }}>Annulla</button><button className="button button--primary" type="submit">Salva budget</button></div></form> : null}
    <div className="directory-grid">{unassignedMovements.length ? <article className="directory-unassigned directory-selectable" tabIndex={0} onClick={() => onShowMovements('Movimenti · Senza categoria', (movement) => movementAllocations(movement).some((allocation) => !allocation.categoryId), (movement) => movementAllocations(movement).filter((allocation) => !allocation.categoryId).reduce((sum, allocation) => sum + allocation.amount, 0))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onShowMovements('Movimenti · Senza categoria', (movement) => movementAllocations(movement).some((allocation) => !allocation.categoryId), (movement) => movementAllocations(movement).filter((allocation) => !allocation.categoryId).reduce((sum, allocation) => sum + allocation.amount, 0)) }}><span className="directory-icon"><Landmark /></span><div><strong>Senza categoria</strong><small>{unassignedMovements.length} {unassignedMovements.length === 1 ? 'movimento' : 'movimenti'}</small></div><div className="directory-actions"><ChevronRight /></div></article> : null}{categories.map((item) => <article className="directory-selectable" key={item.id} tabIndex={0} onClick={() => editingId !== item.id && showCategoryMovements(item)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== item.id) showCategoryMovements(item) }}>
      <span className="category-dot" style={{ background: item.color }} />
      <div>{editingId === item.id ? <input aria-label={`Nome categoria ${item.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(item) }} autoFocus /> : <strong>{item.name}</strong>}<small>{item.movementType === 'income' ? 'Entrata' : 'Spesa'} · {item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div>
      <div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === item.id ? <div className="directory-inline-actions"><button type="button" onClick={() => saveName(item)}>Salva</button><button type="button" onClick={() => setEditingId('')}>Annulla</button></div> : <ActionMenu label={`Azioni per ${item.name}`} items={[{ label: 'Modifica', onSelect: () => { setEditingId(item.id); setEditingName(item.name) } }, ...(item.movementType === 'expense' ? [{ label: item.monthlyBudget ? 'Modifica budget' : 'Imposta budget', onSelect: () => { setBudgetId(item.id); setBudgetAmount(item.monthlyBudget?.toFixed(2).replace('.', ',') ?? '') } }] : []), { label: 'Elimina', danger: true, onSelect: () => { setDeletingId(item.id); setReplacementId(''); setEditingId('') } }]} />}<button className="row-disclosure" type="button" aria-label={`Vedi movimenti di ${item.name}`} onClick={() => showCategoryMovements(item)}><ChevronRight /></button></div>
    </article>)}</div>
  </DirectoryPage>
}

export function BeneficiariesPage({
  data, user, onAddBeneficiary, onUpdateBeneficiary, onDeleteBeneficiary,
  onAddSender, onUpdateSender, onDeleteSender, onShowMovements,
}: BaseProps & {
  onAddBeneficiary: (beneficiary: Beneficiary) => void
  onUpdateBeneficiary: (beneficiary: Beneficiary) => void
  onDeleteBeneficiary: (beneficiaryId: string, replacementId?: string) => void
  onAddSender: (sender: Sender) => void
  onUpdateSender: (sender: Sender) => void
  onDeleteSender: (senderId: string, replacementId?: string) => void
}) {
  const [section, setSection] = useState<'beneficiaries' | 'senders'>('beneficiaries')
  const [showForm, setShowForm] = useState(false); const [name, setName] = useState(''); const [scope, setScope] = useState<'family' | 'personal'>('family')
  const [editingId, setEditingId] = useState(''); const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [replacementQuery, setReplacementQuery] = useState('')
  const beneficiaries = data.beneficiaries.filter((item) => !item.id.startsWith('beneficiary-user-') && (item.scope === 'family' || item.ownerId === user.id)).toSorted(byName)
  const senders = data.senders.filter((item) => item.scope === 'family' || item.ownerId === user.id).toSorted(byName)
  const items = section === 'beneficiaries' ? beneficiaries : senders
  const singular = section === 'beneficiaries' ? 'beneficiario' : 'mittente'
  const unassignedMovements = data.movements.filter((movement) => section === 'beneficiaries'
    ? movement.type === 'expense' && movementAllocations(movement).some((allocation) => !allocation.beneficiaryId)
    : movement.type === 'income' && !movement.senderId)
  const unassignedLabel = section === 'beneficiaries' ? 'Nessun beneficiario' : 'Nessun mittente'
  const changeSection = (next: 'beneficiaries' | 'senders') => {
    setSection(next)
    setShowForm(false)
    setEditingId('')
    setEditingName('')
    setDeletingId('')
    setReplacementId('')
    setReplacementQuery('')
    setName('')
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    const item = { id: makeId(singular), name: name.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined }
    if (section === 'beneficiaries') onAddBeneficiary(item)
    else onAddSender(item)
    setName('')
    setShowForm(false)
  }
  const saveName = (item: Beneficiary | Sender) => {
    if (!editingName.trim()) return
    if (section === 'beneficiaries') onUpdateBeneficiary({ ...item, name: editingName.trim() })
    else onUpdateSender({ ...item, name: editingName.trim() })
    setEditingId('')
    setEditingName('')
  }
  const deletingItem = items.find((item) => item.id === deletingId)
  const replacements = items.filter((item) => item.id !== deletingId && (deletingItem?.scope !== 'family' || item.scope === 'family'))
  const affectedCount = deletingItem
    ? section === 'beneficiaries'
      ? data.movements.filter((movement) => movementAllocations(movement).some((allocation) => allocation.beneficiaryId === deletingItem.id)).length
        + data.scheduledPayments.filter((payment) => movementAllocations(payment).some((allocation) => allocation.beneficiaryId === deletingItem.id)).length
      : data.movements.filter((movement) => movement.senderId === deletingItem.id).length
    : 0
  const confirmDeletion = (event: React.FormEvent) => {
    event.preventDefault()
    if (!deletingItem) return
    const match = replacements.find((item) => item.name.toLocaleLowerCase('it-IT') === replacementQuery.trim().toLocaleLowerCase('it-IT'))
    const created = replacementQuery.trim() && !match ? { id: makeId(singular), name: replacementQuery.trim(), scope: deletingItem.scope, ownerId: deletingItem.scope === 'personal' ? user.id : undefined } : undefined
    if (created) {
      if (section === 'beneficiaries') onAddBeneficiary(created)
      else onAddSender(created)
    }
    const replacement = (created?.id ?? match?.id ?? replacementId) || undefined
    if (section === 'beneficiaries') onDeleteBeneficiary(deletingItem.id, replacement)
    else onDeleteSender(deletingItem.id, replacement)
    setDeletingId('')
    setReplacementId('')
    setReplacementQuery('')
  }
  const showDirectoryMovements = (item: Beneficiary | Sender) => onShowMovements(
    `Movimenti · ${item.name}`,
    (movement) => section === 'beneficiaries'
      ? movement.type === 'expense' && movementAllocations(movement).some((allocation) => allocation.beneficiaryId === item.id)
      : movement.type === 'income' && movement.senderId === item.id,
    section === 'beneficiaries'
      ? (movement) => movementAllocations(movement).filter((allocation) => allocation.beneficiaryId === item.id).reduce((sum, allocation) => sum + allocation.amount, 0)
      : undefined,
  )
  return <DirectoryPage title="Beneficiari e mittenti" subtitle="Negozi e fornitori per le spese, persone ed enti per le entrate." addLabel={`Nuovo ${singular}`} showForm={showForm} setShowForm={setShowForm}>
    <div className="tabs movement-tabs directory-tabs" aria-label="Tipo di anagrafica">
      <button className={section === 'beneficiaries' ? 'active' : ''} onClick={() => changeSection('beneficiaries')}>Beneficiari</button>
      <button className={section === 'senders' ? 'active tab-income' : 'tab-income'} onClick={() => changeSection('senders')}>Mittenti</button>
    </div>
    {showForm ? <InlineForm title={`Nuovo ${singular}`} onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input aria-label={`Nome nuovo ${singular}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={section === 'beneficiaries' ? 'Es. Lidl, Amazon' : 'Es. Datore di lavoro, INPS'} autoFocus /></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    {deletingItem ? <form className="directory-delete-form" onSubmit={confirmDeletion}>
      <div><strong>Elimina {deletingItem.name}</strong><p>{affectedCount ? `${affectedCount} movimenti o rate usano questa anagrafica.` : 'Questa anagrafica non è utilizzata.'}</p></div>
      <CreatableLookup label="Attribuisci i movimenti a" value={replacementQuery} options={replacements} placeholder={section === 'beneficiaries' ? 'Nessun beneficiario' : 'Nessun mittente'} onChange={(value) => { setReplacementQuery(value); setReplacementId(replacements.find((item) => item.name.toLocaleLowerCase('it-IT') === value.trim().toLocaleLowerCase('it-IT'))?.id ?? '') }} />
      <div><button type="button" className="button button--ghost" onClick={() => { setDeletingId(''); setReplacementId('') }}>Annulla</button><button type="submit" className="button button--danger"><Trash2 />Elimina</button></div>
    </form> : null}
    <div className="directory-grid">
      {unassignedMovements.length ? <article className="directory-unassigned directory-selectable" tabIndex={0} onClick={() => onShowMovements(`Movimenti · ${unassignedLabel}`, (movement) => section === 'beneficiaries' ? movement.type === 'expense' && movementAllocations(movement).some((allocation) => !allocation.beneficiaryId) : movement.type === 'income' && !movement.senderId, section === 'beneficiaries' ? (movement) => movementAllocations(movement).filter((allocation) => !allocation.beneficiaryId).reduce((sum, allocation) => sum + allocation.amount, 0) : undefined)}><span className="directory-icon">{section === 'beneficiaries' ? <Building2 /> : <Send />}</span><div><strong>{unassignedLabel}</strong><small>{unassignedMovements.length} {unassignedMovements.length === 1 ? 'movimento' : 'movimenti'}</small></div><div className="directory-actions"><ChevronRight /></div></article> : null}
      {items.map((item) => <article className="directory-selectable" key={item.id} tabIndex={0} onClick={() => editingId !== item.id && showDirectoryMovements(item)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== item.id) showDirectoryMovements(item) }}><span className="directory-icon">{section === 'beneficiaries' ? <Building2 /> : <Send />}</span><div>{editingId === item.id ? <input aria-label={`Nome ${singular} ${item.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(item) }} autoFocus /> : <strong>{item.name}</strong>}<small>{item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div><div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === item.id ? <div className="directory-inline-actions"><button type="button" onClick={() => saveName(item)}>Salva</button><button type="button" onClick={() => { setEditingId(''); setEditingName('') }}>Annulla</button></div> : <ActionMenu label={`Azioni per ${item.name}`} items={[{ label: 'Modifica', onSelect: () => { setEditingId(item.id); setEditingName(item.name) } }, { label: 'Elimina', danger: true, onSelect: () => { setDeletingId(item.id); setReplacementId(''); setEditingId('') } }]} />}<button className="row-disclosure" type="button" aria-label={`Vedi movimenti di ${item.name}`} onClick={() => showDirectoryMovements(item)}><ChevronRight /></button></div></article>)}
    </div>
  </DirectoryPage>
}

export function TagsPage({ data, user, onAdd, onUpdate, onAddReport, onRemoveReport, onShowMovements }: BaseProps & {
  onAdd: (tag: Tag) => void
  onUpdate: (tag: Tag) => void
  onAddReport: (tagId: string) => void
  onRemoveReport: (tagId: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'family' | 'personal'>('family')
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportTagId, setReportTagId] = useState('')
  const [reportTagQuery, setReportTagQuery] = useState('')
  const tags = data.tags.filter((item) => item.scope === 'family' || item.ownerId === user.id).toSorted(byName)
  const visible = visibleMovements(data, user.id)
  const reportTags = data.tagReportIds.map((id) => tags.find((item) => item.id === id)).filter((item): item is Tag => Boolean(item))
  const availableReports = tags.filter((item) => !data.tagReportIds.includes(item.id))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onAdd({ id: makeId('tag'), name: name.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined, color: '#c64e2f' })
    setName('')
    setShowForm(false)
  }
  const saveName = (tag: Tag) => {
    if (!editingName.trim()) return
    onUpdate({ ...tag, name: editingName.trim() })
    setEditingId('')
    setEditingName('')
  }
  const addReport = (event: React.FormEvent) => {
    event.preventDefault()
    const match = availableReports.find((item) => item.name.toLocaleLowerCase('it-IT') === reportTagQuery.trim().toLocaleLowerCase('it-IT'))
    const created = reportTagQuery.trim() && !match ? { id: makeId('tag'), name: reportTagQuery.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined, color: '#c64e2f' } : undefined
    if (created) onAdd(created)
    const selected = (created?.id ?? match?.id ?? reportTagId) || availableReports[0]?.id
    if (!selected) return
    onAddReport(selected)
    setReportTagId('')
    setReportTagQuery('')
    setShowReportForm(false)
  }
  const showTagMovements = (tag: Tag) => onShowMovements(
    `Movimenti · ${tag.name}`,
    (movement) => movementAllocations(movement).some((allocation) => allocation.tagIds.includes(tag.id)),
    (movement) => movementAllocations(movement).filter((allocation) => allocation.tagIds.includes(tag.id)).reduce((sum, allocation) => sum + allocation.amount, 0),
  )
  return <DirectoryPage title="Tag" subtitle="Misura il costo o il risultato di progetti ed eventi." addLabel="Nuovo tag" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuovo tag" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. Vacanza a Parigi" autoFocus /></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    <div className="directory-grid">{tags.map((tag) => <article className="directory-selectable" key={tag.id} tabIndex={0} onClick={() => editingId !== tag.id && showTagMovements(tag)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== tag.id) showTagMovements(tag) }}>
      <span className="directory-icon"><TagIcon /></span>
      <div>{editingId === tag.id ? <input aria-label={`Nome tag ${tag.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(tag) }} autoFocus /> : <strong>{tag.name}</strong>}<small>{tag.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div>
      <div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === tag.id ? <div className="directory-inline-actions"><button type="button" onClick={() => saveName(tag)}>Salva</button><button type="button" onClick={() => setEditingId('')}>Annulla</button></div> : <ActionMenu label={`Azioni per ${tag.name}`} items={[{ label: 'Modifica', onSelect: () => { setEditingId(tag.id); setEditingName(tag.name) } }]} />}<button className="row-disclosure" type="button" aria-label={`Vedi movimenti di ${tag.name}`} onClick={() => showTagMovements(tag)}><ChevronRight /></button></div>
    </article>)}</div>
    <div className="tag-report-toolbar"><div><h2>Righe di riepilogo</h2><p>I tag restano sempre disponibili nei nuovi movimenti.</p></div><button className="button button--ghost" onClick={() => setShowReportForm(true)}><Plus />Aggiungi riepilogo</button></div>
    {showReportForm ? <form className="report-picker" onSubmit={addReport}><CreatableLookup label="Tag da mostrare" value={reportTagQuery} options={availableReports} placeholder="Inserisci tag" onChange={(value) => { setReportTagQuery(value); setReportTagId(availableReports.find((item) => item.name.toLocaleLowerCase('it-IT') === value.trim().toLocaleLowerCase('it-IT'))?.id ?? '') }} /><button className="button button--ghost" type="button" onClick={() => setShowReportForm(false)}>Annulla</button><button className="button button--primary" type="submit"><Plus />Aggiungi riga</button></form> : null}
    <div className="tag-reports">{reportTags.map((tag) => { const tagged = visible.filter((item) => movementAllocations(item).some((allocation) => allocation.tagIds.includes(tag.id))); const expenses = tagged.filter((item) => item.type === 'expense'); const incomes = tagged.filter((item) => item.type === 'income'); const amountForTag = (item: AppData['movements'][number]) => movementAllocations(item).filter((allocation) => allocation.tagIds.includes(tag.id) && !allocation.excludeFromReports).reduce((sum, allocation) => sum + allocation.amount, 0); const spent = expenses.reduce((sum, item) => sum + amountForTag(item), 0); const earned = incomes.reduce((sum, item) => sum + amountForTag(item), 0); return <section key={tag.id}><div className="tag-report__heading"><span className="directory-icon"><TagIcon /></span><div><h2>{tag.name}</h2><p>Bilancio {formatMoney(earned - spent)} · Spese {formatMoney(spent)}</p></div><div className="tag-report__actions"><ActionMenu label={`Azioni riepilogo ${tag.name}`} items={[{ label: 'Rimuovi riepilogo', danger: true, onSelect: () => onRemoveReport(tag.id) }]} /><button className="row-disclosure" type="button" aria-label={`Vedi movimenti di ${tag.name}`} onClick={() => showTagMovements(tag)}><ChevronRight /></button></div></div><DonutChart title="Spese per categoria" data={tagTotalsByCategory(data, expenses, tag.id)} tone="expense" compact /></section> })}</div>
  </DirectoryPage>
}

function tagTotalsByCategory(data: AppData, movements: Movement[], tagId: string) {
  const totals = new Map<string, number>()
  movements.forEach((movement) => movementAllocations(movement)
    .filter((allocation) => allocation.tagIds.includes(tagId) && !allocation.excludeFromReports)
    .forEach((allocation) => totals.set(allocation.categoryId, (totals.get(allocation.categoryId) ?? 0) + allocation.amount)))
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: data.categories.find((category) => category.id === categoryId), total }))
    .filter((item): item is { category: Category; total: number } => Boolean(item.category))
    .toSorted((left, right) => right.total - left.total)
}

function DirectoryPage({ title, subtitle, addLabel, showForm, setShowForm, children }: { title: string; subtitle: string; addLabel: string; showForm: boolean; setShowForm: (value: boolean) => void; children: React.ReactNode }) { return <div className="page"><div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="button button--primary desktop-action" onClick={() => setShowForm(!showForm)}><Plus />{addLabel}</button></div>{children}</div> }
function InlineForm({ title, submitLabel = 'Aggiungi', onSubmit, onCancel, children }: { title: string; submitLabel?: string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; children: React.ReactNode }) { return <form className="inline-form" onSubmit={onSubmit}><div><h2>{title}</h2><p>I campi restano modificabili in seguito.</p></div><div className="inline-form__fields">{children}</div><div className="inline-form__actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">{submitLabel === 'Aggiungi' ? <Plus /> : <Check />}{submitLabel}</button></div></form> }
function ScopeSelect({ value, onChange }: { value: 'family' | 'personal'; onChange: (value: 'family' | 'personal') => void }) { return <label>Visibilità<select value={value} onChange={(e) => onChange(e.target.value as 'family' | 'personal')}><option value="family">Famiglia</option><option value="personal">Solo personale</option></select></label> }
