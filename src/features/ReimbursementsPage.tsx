import { Check, Clock3, HandCoins, Landmark, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { ReimbursementReview } from './Dashboard'
import { PurchaseReview } from './ContactsPage'
import { CreatableLookup } from '../components/CreatableLookup'
import { loanAvailableToRepay, loanOutstanding, sharedBalance } from '../lib/calculations'
import { formatDate, formatMoney } from '../lib/format'
import { functionErrorMessage } from '../lib/functionErrors'
import { isOrdinaryCommissionedPurchase } from '../lib/commissioned'
import type { AppData, Category, CommissionedPurchase, Contact, Loan, LoanRepayment, LoanRepaymentMethod, Reimbursement, User } from '../types'

export interface LoanDraft {
  borrowerId: string
  amount: number
  date: string
  description: string
  lenderAccountId: string
}

export interface LoanRepaymentDraft {
  loanId: string
  amount: number
  date: string
  description: string
  method: LoanRepaymentMethod
  fromAccountId?: string
}

interface Props {
  data: AppData
  user: User
  members: User[]
  contacts?: Contact[]
  purchases?: CommissionedPurchase[]
  onRespond?: (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  onRespondPurchase?: (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => Promise<void>
  onIssuePurchaseReimbursement?: (purchase: CommissionedPurchase, sourceAccountId: string) => Promise<void>
  onRespondPurchaseReimbursement?: (purchase: CommissionedPurchase, accepted: boolean, destinationAccountId?: string) => Promise<void>
  onRequestChange?: (reimbursementId: string, change: { kind: 'update' | 'delete'; amount?: number; date?: string; selectedAccountId?: string }) => Promise<void>
  onRespondChange?: (requestId: string, accepted: boolean) => Promise<void>
  onWithdrawChange?: (requestId: string) => Promise<void>
  onCreateLoan?: (draft: LoanDraft) => Promise<void>
  onRespondLoan?: (loanId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  onCreateLoanRepayment?: (draft: LoanRepaymentDraft) => Promise<void>
  onRespondLoanRepayment?: (repaymentId: string, accepted: boolean, selectedAccountId?: string, category?: Category) => Promise<void>
}

export function ReimbursementsPage({ data, user, members, contacts = [], purchases = [], onRespond, onRespondPurchase, onIssuePurchaseReimbursement, onRespondPurchaseReimbursement, onRequestChange, onRespondChange, onWithdrawChange, onCreateLoan, onRespondLoan, onCreateLoanRepayment, onRespondLoanRepayment }: Props) {
  const [section, setSection] = useState<'expected' | 'owed'>('expected')
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [repayingLoanId, setRepayingLoanId] = useState<string>()
  const [busyPurchaseId, setBusyPurchaseId] = useState<string>()
  const [responseError, setResponseError] = useState('')
  const reimbursements = data.reimbursements
    .filter((item) => section === 'expected' ? item.toId === user.id : item.fromId === user.id)
    .toSorted((left, right) => right.date.localeCompare(left.date))
  const commissioned = purchases
    .filter(isOrdinaryCommissionedPurchase)
    .filter((item) => section === 'expected' ? item.payerId === user.id : item.recipientId === user.id)
    .toSorted((left, right) => right.purchaseDate.localeCompare(left.purchaseDate))
  const loans = data.loans
    .filter((item) => section === 'expected' ? item.lenderId === user.id : item.borrowerId === user.id)
    .toSorted((left, right) => right.date.localeCompare(left.date))
  const respondToPurchase = async (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => {
    if (!onRespondPurchase) return
    setBusyPurchaseId(purchase.id)
    setResponseError('')
    try { await onRespondPurchase(purchase, accepted, categoryId, accountId, category) }
    catch (reason) { setResponseError(reimbursementResponseMessage(reason)) }
    finally { setBusyPurchaseId(undefined) }
  }

  return <div className="page reimbursements-page">
    <div className="page-heading"><div><h1>Rimborsi e prestiti</h1><p>Controlla rimborsi, prestiti e restituzioni ancora da completare.</p></div>{onCreateLoan ? <button className="button button--primary" type="button" onClick={() => setShowLoanForm((current) => !current)}><Plus /> Nuovo prestito</button> : null}</div>
    {showLoanForm && onCreateLoan ? <LoanForm data={data} user={user} members={members} onCancel={() => setShowLoanForm(false)} onSubmit={async (draft) => { await onCreateLoan(draft); setShowLoanForm(false) }} /> : null}
    <div className="tabs reimbursement-tabs" role="tablist" aria-label="Tipo di rimborso">
      <button type="button" role="tab" aria-selected={section === 'expected'} className={section === 'expected' ? 'active' : ''} onClick={() => setSection('expected')}>Attesi</button>
      <button type="button" role="tab" aria-selected={section === 'owed'} className={section === 'owed' ? 'active' : ''} onClick={() => setSection('owed')}>Dovuti</button>
    </div>
    {responseError ? <p className="form-message form-message--error" role="alert">{responseError}</p> : null}
    {reimbursements.length || commissioned.length || loans.length ? <div className="reimbursement-review-list">
      {loans.map((loan) => <LoanCard
        key={loan.id}
        loan={loan}
        data={data}
        user={user}
        members={members}
        repaying={repayingLoanId === loan.id}
        onToggleRepayment={() => setRepayingLoanId((current) => current === loan.id ? undefined : loan.id)}
        onRespond={onRespondLoan}
        onCreateRepayment={onCreateLoanRepayment ? async (draft) => { await onCreateLoanRepayment(draft); setRepayingLoanId(undefined) } : undefined}
        onRespondRepayment={onRespondLoanRepayment}
      />)}
      {reimbursements.map((reimbursement: Reimbursement) => {
        const linkedPurchase = reimbursement.settlementMethod === 'purchase'
          ? purchases.find((purchase) => purchase.id === reimbursement.commissionedPurchaseId)
          : undefined
        if (reimbursement.status === 'pending' && linkedPurchase && linkedPurchase.status === 'pending' && linkedPurchase.recipientId === user.id) {
          return <PurchaseReview key={reimbursement.id} purchase={linkedPurchase} data={data} userId={user.id} payer={contacts.find((item) => item.id === linkedPurchase.payerId)} busy={busyPurchaseId === linkedPurchase.id} onRespond={(accepted, categoryId, accountId, category) => respondToPurchase(linkedPurchase, accepted, categoryId, accountId, category)} />
        }
        if (reimbursement.settlementMethod === 'purchase' && reimbursement.status === 'pending' && reimbursement.authorId !== user.id) {
          return <CommissionedReimbursementStatus key={reimbursement.id} amount={reimbursement.amount} status={linkedPurchase?.status ?? 'pending'} label="Acquisto da catalogare" />
        }
        return <ReimbursementReview key={reimbursement.id} reimbursement={reimbursement} data={data} user={user} members={members} onRespond={onRespond} onRequestChange={onRequestChange} onRespondChange={onRespondChange} onWithdrawChange={onWithdrawChange} />
      })}
      {commissioned.map((purchase) => purchase.status === 'pending' && purchase.recipientId === user.id
        ? <PurchaseReview key={purchase.id} purchase={purchase} data={data} userId={user.id} payer={contacts.find((item) => item.id === purchase.payerId)} busy={busyPurchaseId === purchase.id} onRespond={(accepted, categoryId, accountId, category) => respondToPurchase(purchase, accepted, categoryId, accountId, category)} />
        : <CommissionedPurchaseCard key={purchase.id} purchase={purchase} data={data} user={user} contacts={contacts} onIssue={onIssuePurchaseReimbursement} onRespond={onRespondPurchaseReimbursement} />)}
    </div> : <div className="empty-state"><HandCoins /><h3>Nessun rimborso o prestito {section === 'expected' ? 'atteso' : 'dovuto'}</h3><p>Le richieste compariranno qui quando verranno registrate.</p></div>}
  </div>
}

function CommissionedPurchaseCard({ purchase, data, user, contacts, onIssue, onRespond }: {
  purchase: CommissionedPurchase
  data: AppData
  user: User
  contacts: Contact[]
  onIssue?: (purchase: CommissionedPurchase, sourceAccountId: string) => Promise<void>
  onRespond?: (purchase: CommissionedPurchase, accepted: boolean, destinationAccountId?: string) => Promise<void>
}) {
  const accounts = data.accounts.filter((account) => account.scope === 'personal' && (!account.ownerId || account.ownerId === user.id))
  const defaultAccount = data.defaultMovementAccountIds?.[user.id]
  const [accountId, setAccountId] = useState(defaultAccount && accounts.some((account) => account.id === defaultAccount) ? defaultAccount : accounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const recipient = contacts.find((contact) => contact.id === purchase.recipientId)
  const payer = contacts.find((contact) => contact.id === purchase.payerId)
  const reimbursementStatus = purchase.reimbursementStatus ?? (purchase.status === 'confirmed' ? 'pending' : undefined)
  const lastInteraction = purchase.reimbursementCancelledAt
    ?? purchase.reimbursementConfirmedAt
    ?? purchase.reimbursementIssuedAt
    ?? purchase.resolvedAt
    ?? purchase.createdAt
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() }
    catch (reason) { setError(reimbursementResponseMessage(reason)) }
    finally { setBusy(false) }
  }

  if (purchase.status === 'rejected') return <CommissionedReimbursementStatus amount={purchase.amount} status="rejected" label={purchase.description} lastInteraction={lastInteraction} />
  if (purchase.status === 'pending') return <CommissionedReimbursementStatus amount={purchase.amount} status="pending" label={purchase.description} lastInteraction={lastInteraction} />
  if (reimbursementStatus === 'cancelled') return <CommissionedReimbursementStatus amount={purchase.amount} status="cancelled" label={purchase.description} lastInteraction={lastInteraction} />
  if (reimbursementStatus === 'confirmed') return <CommissionedReimbursementStatus amount={purchase.amount} status="confirmed" label={purchase.description} lastInteraction={lastInteraction} />

  if (purchase.recipientId === user.id && reimbursementStatus === 'not_issued') return <article className="reimbursement-review reimbursement-review--action">
    <span><HandCoins /></span><div><strong>{purchase.description}</strong><small>{formatMoney(purchase.amount)} · acquisto ricevuto e catalogato</small><label>Dal tuo conto<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Seleziona un conto</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><small>Il conto verrà addebitato solo quando emetti il rimborso a {payer?.name ?? 'chi ha anticipato la spesa'}.</small>{error ? <small className="field-error" role="alert">{error}</small> : null}</div><div className="reimbursement-review__actions"><button className="button button--primary" type="button" disabled={busy || !accountId || !onIssue} onClick={() => void act(() => onIssue!(purchase, accountId))}><Check /> Emetti rimborso</button></div>
  </article>

  if (purchase.payerId === user.id && reimbursementStatus === 'pending') return <article className="reimbursement-review reimbursement-review--action">
    <span><HandCoins /></span><div><strong>{recipient?.name ?? 'Il destinatario'} ha emesso un rimborso di {formatMoney(purchase.amount)}</strong><small>{purchase.description} · emesso il {formatDate((purchase.reimbursementIssuedAt ?? purchase.purchaseDate).slice(0, 10))}</small><label>Il tuo conto di destinazione<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Seleziona un conto</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{error ? <small className="field-error" role="alert">{error}</small> : null}</div><div className="reimbursement-review__actions"><button className="button button--ghost" type="button" disabled={busy || !onRespond} onClick={() => void act(() => onRespond!(purchase, false))}><X /> Rifiuta</button><button className="button button--primary" type="button" disabled={busy || !accountId || !onRespond} onClick={() => void act(() => onRespond!(purchase, true, accountId))}><Check /> Conferma ricezione</button></div>
  </article>

  const pendingLabel = reimbursementStatus === 'pending' ? 'Rimborso emesso, in attesa della conferma di ricezione' : `Acquisto ricevuto: ${recipient?.name ?? 'il destinatario'} deve emettere il rimborso`
  return <article className="reimbursement-review"><span><Clock3 /></span><div><strong>{purchase.description}</strong><small>{formatMoney(purchase.amount)} · {pendingLabel}</small><small>Ultima interazione: {formatDate(lastInteraction.slice(0, 10))}</small></div></article>
}

function LoanForm({ data, user, members, onSubmit, onCancel }: {
  data: AppData
  user: User
  members: User[]
  onSubmit: (draft: LoanDraft) => Promise<void>
  onCancel: () => void
}) {
  const borrowers = members.filter((member) => member.id !== user.id)
  const accounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === user.id)
  const [borrowerId, setBorrowerId] = useState(borrowers[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="loan-form" onSubmit={(event) => {
    event.preventDefault()
    const numericAmount = Number(amount.replace(',', '.'))
    if (!borrowerId || !accountId || !description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Completa tutti i campi del prestito.'); return }
    setBusy(true); setError('')
    void onSubmit({ borrowerId, amount: numericAmount, date, description: description.trim(), lenderAccountId: accountId })
      .catch((reason) => setError(functionErrorMessage(reason) || 'Non è stato possibile creare il prestito.'))
      .finally(() => setBusy(false))
  }}>
    <div className="loan-form__heading"><span><Landmark /></span><div><strong>Nuovo prestito</strong><small>Il denaro sarà contabilizzato solo dopo la conferma di chi lo riceve.</small></div></div>
    <div className="form-grid"><label>Beneficiario<select value={borrowerId} onChange={(event) => setBorrowerId(event.target.value)}>{borrowers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Importo<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Dal tuo conto<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
    <label>Motivo<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Per cosa viene concesso" /></label>
    {error ? <small className="field-error">{error}</small> : null}<div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" disabled={busy}>{busy ? 'Invio…' : 'Invia per conferma'}</button></div>
  </form>
}

function LoanCard({ loan, data, user, members, repaying, onToggleRepayment, onRespond, onCreateRepayment, onRespondRepayment }: {
  loan: Loan
  data: AppData
  user: User
  members: User[]
  repaying: boolean
  onToggleRepayment: () => void
  onRespond?: (loanId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  onCreateRepayment?: (draft: LoanRepaymentDraft) => Promise<void>
  onRespondRepayment?: (repaymentId: string, accepted: boolean, selectedAccountId?: string, category?: Category) => Promise<void>
}) {
  const lender = members.find((member) => member.id === loan.lenderId)
  const borrower = members.find((member) => member.id === loan.borrowerId)
  const outstanding = loanOutstanding(data, loan)
  const accounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === user.id)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const repayments = data.loanRepayments.filter((item) => item.loanId === loan.id).toSorted((a, b) => b.date.localeCompare(a.date))
  const respond = (accepted: boolean) => {
    if (!onRespond) return
    setBusy(true); setError('')
    void onRespond(loan.id, accepted, accepted ? accountId : undefined)
      .catch((reason) => setError(functionErrorMessage(reason) || 'Non è stato possibile rispondere al prestito.'))
      .finally(() => setBusy(false))
  }
  return <article className={`loan-card loan-card--${loan.status}`}>
    <div className="loan-card__summary"><span><Landmark /></span><div><strong>{loan.description}</strong><small>{lender?.name ?? 'Prestatore'} → {borrower?.name ?? 'Beneficiario'} · {formatMoney(loan.amount)} · {loan.date}</small></div><div className="loan-card__amount"><small>Residuo</small><strong>{formatMoney(outstanding)}</strong></div></div>
    {loan.status === 'pending' ? loan.borrowerId === user.id ? <div className="loan-card__decision"><label>Il tuo conto di destinazione<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="reimbursement-review__actions"><button className="button button--ghost" type="button" disabled={busy} onClick={() => respond(false)}><X /> Rifiuta</button><button className="button button--primary" type="button" disabled={busy || !accountId} onClick={() => respond(true)}><Check /> Conferma prestito</button></div></div> : <small>In attesa della conferma di {borrower?.name ?? 'chi riceve il prestito'}.</small> : null}
    {loan.status === 'rejected' ? <small>Prestito rifiutato.</small> : null}
    {loan.status === 'confirmed' && loan.borrowerId === user.id && outstanding > 0 ? <button className="button button--secondary loan-card__repay" type="button" onClick={onToggleRepayment}><RotateCcw /> Restituisci</button> : null}
    {repaying && onCreateRepayment ? <LoanRepaymentForm loan={loan} data={data} user={user} memberCount={members.length} onSubmit={onCreateRepayment} onCancel={onToggleRepayment} /> : null}
    {repayments.length ? <div className="loan-repayments"><strong>Restituzioni</strong>{repayments.map((repayment) => <LoanRepaymentRow key={repayment.id} repayment={repayment} data={data} user={user} onRespond={onRespondRepayment} />)}</div> : null}
    {error ? <small className="field-error">{error}</small> : null}
  </article>
}

function LoanRepaymentForm({ loan, data, user, memberCount, onSubmit, onCancel }: {
  loan: Loan
  data: AppData
  user: User
  memberCount: number
  onSubmit: (draft: LoanRepaymentDraft) => Promise<void>
  onCancel: () => void
}) {
  const available = loanAvailableToRepay(data, loan)
  const familyCredit = Math.max(0, Math.min(sharedBalance(data, loan.borrowerId, memberCount), -sharedBalance(data, loan.lenderId, memberCount), available))
  const accounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === user.id)
  const [amount, setAmount] = useState(available.toFixed(2).replace('.', ','))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('Restituzione prestito')
  const [method, setMethod] = useState<LoanRepaymentMethod>('money')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="loan-repayment-form" onSubmit={(event) => {
    event.preventDefault()
    const numericAmount = Number(amount.replace(',', '.'))
    const limit = method === 'family_credit' ? familyCredit : available
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > limit + .001 || (method !== 'family_credit' && !accountId)) { setError(`L’importo massimo disponibile è ${formatMoney(limit)}.`); return }
    setBusy(true); setError('')
    void onSubmit({ loanId: loan.id, amount: numericAmount, date, description: description.trim() || 'Restituzione prestito', method, fromAccountId: method === 'family_credit' ? undefined : accountId })
      .catch((reason) => setError(functionErrorMessage(reason) || 'Non è stato possibile inviare la restituzione.'))
      .finally(() => setBusy(false))
  }}>
    <div className="form-grid"><label>Importo<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Modalità<select value={method} onChange={(event) => setMethod(event.target.value as LoanRepaymentMethod)}><option value="money">Denaro</option><option value="purchase">Tramite acquisto</option><option value="family_credit" disabled={familyCredit <= 0}>Credito familiare · {formatMoney(familyCredit)}</option></select></label>{method !== 'family_credit' ? <label>Dal tuo conto<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}</div>
    <label>Descrizione<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    {method === 'purchase' ? <small>Il tuo conto verrà addebitato subito; il prestatore sceglierà la categoria quando conferma.</small> : method === 'family_credit' ? <small>Alla conferma, il tuo credito familiare e il debito familiare del prestatore diminuiranno dello stesso importo.</small> : null}
    {error ? <small className="field-error">{error}</small> : null}<div className="form-actions"><button className="button button--ghost" type="button" onClick={onCancel}>Annulla</button><button className="button button--primary" disabled={busy}>Invia restituzione</button></div>
  </form>
}

function LoanRepaymentRow({ repayment, data, user, onRespond }: {
  repayment: LoanRepayment
  data: AppData
  user: User
  onRespond?: (repaymentId: string, accepted: boolean, selectedAccountId?: string, category?: Category) => Promise<void>
}) {
  const accounts = data.accounts.filter((account) => account.scope === 'personal' && account.ownerId === user.id)
  const categories = data.categories.filter((category) => category.movementType === 'expense' && (category.scope === 'family' || category.ownerId === user.id))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryName, setCategoryName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const methodLabel = repayment.method === 'money' ? 'Denaro' : repayment.method === 'purchase' ? 'Acquisto' : 'Credito familiare'
  const respond = (accepted: boolean) => {
    if (!onRespond) return
    const existing = categories.find((item) => item.name.localeCompare(categoryName.trim(), 'it', { sensitivity: 'accent' }) === 0)
    const category = repayment.method === 'purchase' && accepted
      ? existing ?? (categoryName.trim() ? { id: `category-loan-${crypto.randomUUID()}`, name: categoryName.trim(), scope: 'personal' as const, ownerId: user.id, movementType: 'expense' as const, color: '#3f7650' } : undefined)
      : undefined
    if (accepted && repayment.method === 'purchase' && !category) { setError('Scegli o aggiungi una categoria.'); return }
    setBusy(true); setError('')
    void onRespond(repayment.id, accepted, repayment.method === 'money' ? accountId : undefined, category)
      .catch((reason) => setError(functionErrorMessage(reason) || 'Non è stato possibile rispondere.'))
      .finally(() => setBusy(false))
  }
  return <div className="loan-repayment-row"><div><span>{formatMoney(repayment.amount)} · {methodLabel}</span><small>{repayment.date} · {repayment.status === 'pending' ? 'In attesa' : repayment.status === 'confirmed' ? 'Confermata' : 'Rifiutata'}</small></div>{repayment.status === 'pending' && repayment.lenderId === user.id && onRespond ? <div className="loan-repayment-row__response">{repayment.method === 'money' ? <label>Conto di destinazione<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}{repayment.method === 'purchase' ? <CreatableLookup label="Categoria dell’acquisto" value={categoryName} options={categories} placeholder="Cerca o aggiungi categoria" onChange={setCategoryName} /> : null}<div className="reimbursement-review__actions"><button className="button button--ghost" type="button" disabled={busy} onClick={() => respond(false)}><X /> Rifiuta</button><button className="button button--primary" type="button" disabled={busy || (repayment.method === 'money' && !accountId)} onClick={() => respond(true)}><Check /> Conferma</button></div></div> : null}{error ? <small className="field-error">{error}</small> : null}</div>
}

function reimbursementResponseMessage(reason: unknown) {
  const message = functionErrorMessage(reason)
  if (message.includes('reimbursement_accounts_required')) return 'Il rimborso non contiene ancora entrambi i conti necessari. Chi lo ha creato deve indicare il proprio conto e inviarlo nuovamente.'
  if (message.includes('purchase_catalog_required')) return 'Scegli la categoria prima di confermare l’acquisto.'
  if (message.includes('reimbursement_purchase_mismatch')) return 'Questo acquisto non è più collegato correttamente al rimborso. La richiesta deve essere reinviata.'
  if (message.includes('reimbursement_account_not_owned')) return 'Il conto scelto non risulta tra i tuoi conti personali sincronizzati. Aggiorna i dati e riprova.'
  if (message.includes('reimbursement_source_account_required') || message.includes('reimbursement_destination_account_required')) return 'Scegli il conto da usare per il rimborso.'
  if (message.includes('already_resolved')) return 'Questa richiesta è già stata gestita. Aggiorna la pagina per vedere lo stato corrente.'
  return message || 'Non è stato possibile confermare il rimborso. Riprova tra poco.'
}

function CommissionedReimbursementStatus({ amount, status, label, lastInteraction }: {
  amount: number
  status: CommissionedPurchase['status'] | 'cancelled'
  label: string
  lastInteraction?: string
}) {
  const state = status === 'pending' ? 'In attesa di conferma' : status === 'confirmed' ? 'Confermato e registrato' : status === 'cancelled' ? 'Annullato' : 'Rifiutato'
  return <article className={`reimbursement-review ${status === 'rejected' || status === 'cancelled' ? 'reimbursement-review--rejected' : ''}`}><span>{status === 'cancelled' ? <Trash2 /> : <HandCoins />}</span><div><strong>{label}</strong><small>{formatMoney(amount)} · {state}</small>{lastInteraction ? <small>Ultima interazione: {formatDate(lastInteraction.slice(0, 10))}</small> : null}</div></article>
}
