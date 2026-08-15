import { Building2, Check, CreditCard, Edit3, Eye, Landmark, LockKeyhole, Plus, Send, Share2, Tag as TagIcon, Trash2, WalletCards, X } from 'lucide-react'
import { useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import { accountBalance, movementAllocations, totalsByCategory, visibleMovements } from '../lib/calculations'
import { formatDate, formatMoney, makeId, todayISO } from '../lib/format'
import type { Account, AppData, Beneficiary, Category, MovementType, ReimbursementAccountReference, Sender, Tag, User } from '../types'

interface BaseProps { data: AppData; user: User; onShowMovements: (title: string, filter: (movement: AppData['movements'][number]) => boolean, amount?: (movement: AppData['movements'][number]) => number) => void }

export function AccountsPage({ data, user, onAdd, onUpdate, onShowMovements, families = [], activeFamilyId, reimbursementSharing }: BaseProps & {
  onAdd: (account: Account, familyId?: string) => void | Promise<void>
  onUpdate: (account: Account) => void
  families?: Array<{ id: string; name: string }>
  activeFamilyId?: string
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
  const [editingBalance, setEditingBalance] = useState('')
  const [editingBalanceDate, setEditingBalanceDate] = useState(todayISO())
  const [sharingAccountId, setSharingAccountId] = useState('')
  const [sharingError, setSharingError] = useState('')
  const accounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim()) return
    if (scope === 'family' && families.length && !targetFamilyId) { setFormError('Scegli la famiglia del conto.'); return }
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
    setEditingBalance(account.openingBalance.toFixed(2).replace('.', ','))
    setEditingBalanceDate(account.openingBalanceDate ?? todayISO())
  }
  const updateOpeningBalance = (event: React.FormEvent) => {
    event.preventDefault()
    const account = data.accounts.find((item) => item.id === editingAccountId)
    if (!account || !editingBalanceDate) return
    const numericBalance = Number(editingBalance.replace(',', '.'))
    if (!Number.isFinite(numericBalance)) return
    onUpdate({ ...account, openingBalance: numericBalance, openingBalanceDate: editingBalanceDate })
    setEditingAccountId('')
  }
  return <div className="page accounts-page"><div className="page-heading accounts-heading"><div><h1>Conti</h1><p>Conti personali, condivisi e disponibilità liquide.</p></div><div className="heading-actions"><button className="button button--primary" onClick={() => setShowForm(true)}><Plus />Aggiungi conto</button></div></div>
    {showForm ? <InlineForm title="Nuovo conto" submitLabel={formBusy ? 'Creazione…' : 'Crea conto'} onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome conto<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Conto principale" autoFocus /></label><label>Istituto o dettaglio<input value={institution} onChange={(e) => setInstitution(e.target.value)} /></label><label>Tipo<select value={type} onChange={(e) => setType(e.target.value as Account['type'])}><option value="bank">Conto bancario</option><option value="credit">Carta di credito</option><option value="cash">Contanti</option><option value="paypal">PayPal</option></select></label><label>Visibilità<select value={scope} onChange={(e) => setScope(e.target.value as Account['scope'])}><option value="personal">Personale</option>{families.length ? <option value="family">Condiviso con una famiglia</option> : null}</select></label>{scope === 'family' ? <label>Famiglia<select aria-label="Famiglia del conto" value={targetFamilyId} onChange={(event) => setTargetFamilyId(event.target.value)} required>{families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}</select></label> : null}<label>Saldo iniziale<input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></label><label>Data del saldo iniziale<input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} required /></label>{formError ? <p className="form-message form-message--error" role="alert">{formError}</p> : null}</InlineForm> : null}
    {editingAccountId ? <InlineForm title="Correggi saldo iniziale" submitLabel="Salva saldo" onSubmit={updateOpeningBalance} onCancel={() => setEditingAccountId('')}><label>Saldo iniziale<input inputMode="decimal" value={editingBalance} onChange={(e) => setEditingBalance(e.target.value)} autoFocus required /></label><label>Data di riferimento<input type="date" value={editingBalanceDate} onChange={(e) => setEditingBalanceDate(e.target.value)} required /></label><p className="field-explanation">I movimenti precedenti a questa data possono restare solo nelle statistiche, senza modificare il saldo calcolato.</p></InlineForm> : null}
    {reimbursementSharing ? <p className="field-explanation reimbursement-privacy-note"><LockKeyhole /> Per ogni conto personale scegli in quali famiglie renderne visibile soltanto il nome. Saldo, istituto e movimenti restano privati.</p> : null}
    {sharingError ? <p className="form-message form-message--error" role="alert">{sharingError}</p> : null}
    <div className="management-list">{accounts.map((account) => {
      const selectedFamilyIds = reimbursementSharing?.references.filter((item) => item.ownerId === user.id && item.accountId === account.id).map((item) => item.familyId) ?? []
      const sharedFamilyName = families.find((family) => family.id === activeFamilyId)?.name
      return <article className="management-row" key={account.id}><span className="management-row__icon">{account.type === 'bank' ? <Landmark /> : account.type === 'credit' || account.type === 'paypal' ? <CreditCard /> : <WalletCards />}</span><div className="management-row__info"><strong>{account.name}{selectedFamilyIds.length ? <Eye aria-label="Visibile per i rimborsi" /> : null}</strong><small>{account.institution} · {account.scope === 'family' ? `Condiviso con ${sharedFamilyName ?? 'la famiglia'}` : 'Personale'}</small><small>Saldo iniziale {formatMoney(account.openingBalance)}{account.openingBalanceDate ? ` · ${formatDate(account.openingBalanceDate)}` : ''}</small>{account.scope === 'personal' && reimbursementSharing ? <fieldset className="account-family-sharing"><legend>Visibile per i rimborsi in</legend>{families.map((family) => {
        return <label key={family.id} className="account-sharing-toggle"><input type="checkbox" checked={selectedFamilyIds.includes(family.id)} disabled={sharingAccountId === account.id} onChange={(event) => {
          const nextFamilyIds = event.target.checked ? [...selectedFamilyIds, family.id] : selectedFamilyIds.filter((familyId) => familyId !== family.id)
          setSharingAccountId(account.id)
          setSharingError('')
          void reimbursementSharing.onChange(account, nextFamilyIds)
            .catch((reason) => setSharingError(reason instanceof Error ? reason.message : 'Non è stato possibile aggiornare la visibilità del conto.'))
            .finally(() => setSharingAccountId(''))
        }} /> {family.name}</label>
      })}</fieldset> : null}</div><div className="management-row__actions"><button className="detail-button" onClick={() => startEditing(account)}><Edit3 />Saldo iniziale</button><button className="detail-button" onClick={() => onShowMovements(`Movimenti · ${account.name}`, (movement) => movement.accountId === account.id)}><Eye />Movimenti</button></div><div className="management-row__value"><small>Saldo calcolato</small><b className={accountBalance(data, account.id) < 0 ? 'negative-text' : ''}>{formatMoney(accountBalance(data, account.id))}</b></div></article>
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
  const categories = data.categories.filter((item) => item.scope === 'family' || item.ownerId === user.id)
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
  const showCategoryMovements = (item: Category) => onShowMovements(
    `Movimenti · ${item.name}`,
    (movement) => movementAllocations(movement).some((allocation) => allocation.categoryId === item.id),
    (movement) => movementAllocations(movement).filter((allocation) => allocation.categoryId === item.id).reduce((sum, allocation) => sum + allocation.amount, 0),
  )
  return <DirectoryPage title="Categorie" subtitle="Categorie distinte per spese ed entrate." addLabel="Nuova categoria" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuova categoria" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label>Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value as MovementType)}><option value="expense">Spesa</option><option value="income">Entrata</option></select></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    {deletingItem ? <form className="directory-delete-form" onSubmit={(event) => { event.preventDefault(); onDelete(deletingItem.id, replacementId || undefined); setDeletingId(''); setReplacementId('') }}>
      <div><strong>Elimina {deletingItem.name}</strong><p>{affectedCount ? `${affectedCount} movimenti o rate usano questa categoria.` : 'Questa categoria non è utilizzata.'}</p></div>
      <label>Attribuisci i movimenti a<select aria-label="Attribuisci i movimenti a" value={replacementId} onChange={(event) => setReplacementId(event.target.value)} autoFocus><option value="">Senza categoria</option>{replacements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div><button type="button" className="button button--ghost" onClick={() => { setDeletingId(''); setReplacementId('') }}>Annulla</button><button type="submit" className="button button--danger"><Trash2 />Elimina</button></div>
    </form> : null}
    <div className="directory-grid">{unassignedMovements.length ? <article className="directory-unassigned directory-selectable" tabIndex={0} onClick={() => onShowMovements('Movimenti · Senza categoria', (movement) => movementAllocations(movement).some((allocation) => !allocation.categoryId), (movement) => movementAllocations(movement).filter((allocation) => !allocation.categoryId).reduce((sum, allocation) => sum + allocation.amount, 0))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onShowMovements('Movimenti · Senza categoria', (movement) => movementAllocations(movement).some((allocation) => !allocation.categoryId), (movement) => movementAllocations(movement).filter((allocation) => !allocation.categoryId).reduce((sum, allocation) => sum + allocation.amount, 0)) }}><span className="directory-icon"><Landmark /></span><div><strong>Senza categoria</strong><small>{unassignedMovements.length} {unassignedMovements.length === 1 ? 'movimento' : 'movimenti'}</small></div><div className="directory-actions"><Eye /></div></article> : null}{categories.map((item) => <article className="directory-selectable" key={item.id} tabIndex={0} onClick={() => editingId !== item.id && showCategoryMovements(item)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== item.id) showCategoryMovements(item) }}>
      <span className="category-dot" style={{ background: item.color }} />
      <div>{editingId === item.id ? <input aria-label={`Nome categoria ${item.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(item) }} autoFocus /> : <strong>{item.name}</strong>}<small>{item.movementType === 'income' ? 'Entrata' : 'Spesa'} · {item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div>
      <div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === item.id ? <><button className="icon-button" title="Salva nome" onClick={() => saveName(item)}><Check /></button><button className="icon-button" title="Annulla modifica" onClick={() => setEditingId('')}><X /></button></> : <button className="icon-button" title="Modifica nome" onClick={() => { setEditingId(item.id); setEditingName(item.name) }}><Edit3 /></button>}<button className="icon-button" title="Vedi movimenti" onClick={() => showCategoryMovements(item)}><Eye /></button><button className="icon-button icon-button--danger" title="Elimina categoria" onClick={() => { setDeletingId(item.id); setReplacementId(''); setEditingId('') }}><Trash2 /></button></div>
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
  const beneficiaries = data.beneficiaries.filter((item) => !item.id.startsWith('beneficiary-user-') && (item.scope === 'family' || item.ownerId === user.id))
  const senders = data.senders.filter((item) => item.scope === 'family' || item.ownerId === user.id)
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
    const replacement = replacementId || undefined
    if (section === 'beneficiaries') onDeleteBeneficiary(deletingItem.id, replacement)
    else onDeleteSender(deletingItem.id, replacement)
    setDeletingId('')
    setReplacementId('')
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
      <label>Attribuisci i movimenti a<select value={replacementId} onChange={(event) => setReplacementId(event.target.value)} autoFocus><option value="">{section === 'beneficiaries' ? 'Nessun beneficiario' : 'Nessun mittente'}</option>{replacements.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div><button type="button" className="button button--ghost" onClick={() => { setDeletingId(''); setReplacementId('') }}>Annulla</button><button type="submit" className="button button--danger"><Trash2 />Elimina</button></div>
    </form> : null}
    <div className="directory-grid">
      {unassignedMovements.length ? <article className="directory-unassigned directory-selectable" tabIndex={0} onClick={() => onShowMovements(`Movimenti · ${unassignedLabel}`, (movement) => section === 'beneficiaries' ? movement.type === 'expense' && movementAllocations(movement).some((allocation) => !allocation.beneficiaryId) : movement.type === 'income' && !movement.senderId, section === 'beneficiaries' ? (movement) => movementAllocations(movement).filter((allocation) => !allocation.beneficiaryId).reduce((sum, allocation) => sum + allocation.amount, 0) : undefined)}><span className="directory-icon">{section === 'beneficiaries' ? <Building2 /> : <Send />}</span><div><strong>{unassignedLabel}</strong><small>{unassignedMovements.length} {unassignedMovements.length === 1 ? 'movimento' : 'movimenti'}</small></div><div className="directory-actions"><Eye /></div></article> : null}
      {items.map((item) => <article className="directory-selectable" key={item.id} tabIndex={0} onClick={() => editingId !== item.id && showDirectoryMovements(item)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== item.id) showDirectoryMovements(item) }}><span className="directory-icon">{section === 'beneficiaries' ? <Building2 /> : <Send />}</span><div>{editingId === item.id ? <input aria-label={`Nome ${singular} ${item.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(item) }} autoFocus /> : <strong>{item.name}</strong>}<small>{item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div><div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === item.id ? <><button className="icon-button" title="Salva nome" onClick={() => saveName(item)}><Check /></button><button className="icon-button" title="Annulla modifica" onClick={() => { setEditingId(''); setEditingName('') }}><X /></button></> : <button className="icon-button" title="Modifica nome" onClick={() => { setEditingId(item.id); setEditingName(item.name) }}><Edit3 /></button>}<button className="icon-button" title="Vedi movimenti" onClick={() => showDirectoryMovements(item)}><Eye /></button><button className="icon-button icon-button--danger" title={`Elimina ${singular}`} onClick={() => { setDeletingId(item.id); setReplacementId(''); setEditingId('') }}><Trash2 /></button></div></article>)}
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
  const tags = data.tags.filter((item) => item.scope === 'family' || item.ownerId === user.id)
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
    const selected = reportTagId || availableReports[0]?.id
    if (!selected) return
    onAddReport(selected)
    setReportTagId('')
    setShowReportForm(false)
  }
  const showTagMovements = (tag: Tag) => onShowMovements(`Movimenti · ${tag.name}`, (movement) => movement.tagId === tag.id)
  return <DirectoryPage title="Tag" subtitle="Misura il costo o il risultato di progetti ed eventi." addLabel="Nuovo tag" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuovo tag" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. Vacanza a Parigi" autoFocus /></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    <div className="directory-grid">{tags.map((tag) => <article className="directory-selectable" key={tag.id} tabIndex={0} onClick={() => editingId !== tag.id && showTagMovements(tag)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && editingId !== tag.id) showTagMovements(tag) }}>
      <span className="directory-icon"><TagIcon /></span>
      <div>{editingId === tag.id ? <input aria-label={`Nome tag ${tag.name}`} className="directory-edit-input" value={editingName} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') saveName(tag) }} autoFocus /> : <strong>{tag.name}</strong>}<small>{tag.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div>
      <div className="directory-actions" onClick={(event) => event.stopPropagation()}>{editingId === tag.id ? <><button className="icon-button" title="Salva nome" onClick={() => saveName(tag)}><Check /></button><button className="icon-button" title="Annulla modifica" onClick={() => setEditingId('')}><X /></button></> : <button className="icon-button" title="Modifica nome" onClick={() => { setEditingId(tag.id); setEditingName(tag.name) }}><Edit3 /></button>}<button className="icon-button" title="Vedi movimenti" onClick={() => showTagMovements(tag)}><Eye /></button></div>
    </article>)}</div>
    <div className="tag-report-toolbar"><div><h2>Righe di riepilogo</h2><p>I tag restano sempre disponibili nei nuovi movimenti.</p></div><button className="button button--ghost" onClick={() => setShowReportForm(true)} disabled={!availableReports.length}><Plus />Aggiungi riepilogo</button></div>
    {showReportForm ? <form className="report-picker" onSubmit={addReport}><label>Tag da mostrare<select value={reportTagId} onChange={(event) => setReportTagId(event.target.value)} autoFocus>{availableReports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button button--ghost" type="button" onClick={() => setShowReportForm(false)}>Annulla</button><button className="button button--primary" type="submit"><Plus />Aggiungi riga</button></form> : null}
    <div className="tag-reports">{reportTags.map((tag) => { const tagged = visible.filter((item) => item.tagId === tag.id); const expenses = tagged.filter((item) => item.type === 'expense'); const incomes = tagged.filter((item) => item.type === 'income'); const spent = expenses.reduce((sum, item) => sum + item.amount, 0); const earned = incomes.reduce((sum, item) => sum + item.amount, 0); return <section key={tag.id}><div className="tag-report__heading"><span className="directory-icon"><TagIcon /></span><div><h2>{tag.name}</h2><p>Bilancio {formatMoney(earned - spent)} · Spese {formatMoney(spent)}</p></div><div className="tag-report__actions"><button className="detail-button" onClick={() => showTagMovements(tag)}><Eye />Movimenti</button><button className="icon-button icon-button--danger" title="Rimuovi riga di riepilogo" onClick={() => onRemoveReport(tag.id)}><Trash2 /></button></div></div><DonutChart title="Spese per categoria" data={totalsByCategory(data, expenses)} tone="expense" compact /></section> })}</div>
  </DirectoryPage>
}

function DirectoryPage({ title, subtitle, addLabel, showForm, setShowForm, children }: { title: string; subtitle: string; addLabel: string; showForm: boolean; setShowForm: (value: boolean) => void; children: React.ReactNode }) { return <div className="page"><div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="button button--primary desktop-action" onClick={() => setShowForm(!showForm)}><Plus />{addLabel}</button></div>{children}</div> }
function InlineForm({ title, submitLabel = 'Aggiungi', onSubmit, onCancel, children }: { title: string; submitLabel?: string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; children: React.ReactNode }) { return <form className="inline-form" onSubmit={onSubmit}><div><h2>{title}</h2><p>I campi restano modificabili in seguito.</p></div><div className="inline-form__fields">{children}</div><div className="inline-form__actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">{submitLabel === 'Aggiungi' ? <Plus /> : <Check />}{submitLabel}</button></div></form> }
function ScopeSelect({ value, onChange }: { value: 'family' | 'personal'; onChange: (value: 'family' | 'personal') => void }) { return <label>Visibilità<select value={value} onChange={(e) => onChange(e.target.value as 'family' | 'personal')}><option value="family">Famiglia</option><option value="personal">Solo personale</option></select></label> }
