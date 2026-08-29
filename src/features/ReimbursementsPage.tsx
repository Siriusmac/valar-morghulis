import { HandCoins } from 'lucide-react'
import { useState } from 'react'
import { ReimbursementReview } from './Dashboard'
import { PurchaseReview } from './ContactsPage'
import { formatMoney } from '../lib/format'
import { functionErrorMessage } from '../lib/functionErrors'
import { isOrdinaryCommissionedPurchase } from '../lib/commissioned'
import type { AppData, Category, CommissionedPurchase, Contact, Reimbursement, User } from '../types'

interface Props {
  data: AppData
  user: User
  members: User[]
  contacts?: Contact[]
  purchases?: CommissionedPurchase[]
  onRespond?: (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  onRespondPurchase?: (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => Promise<void>
  onRequestChange?: (reimbursementId: string, change: { kind: 'update' | 'delete'; amount?: number; date?: string; selectedAccountId?: string }) => Promise<void>
  onRespondChange?: (requestId: string, accepted: boolean) => Promise<void>
  onWithdrawChange?: (requestId: string) => Promise<void>
}

export function ReimbursementsPage({ data, user, members, contacts = [], purchases = [], onRespond, onRespondPurchase, onRequestChange, onRespondChange, onWithdrawChange }: Props) {
  const [section, setSection] = useState<'expected' | 'owed'>('expected')
  const [busyPurchaseId, setBusyPurchaseId] = useState<string>()
  const [responseError, setResponseError] = useState('')
  const reimbursements = data.reimbursements
    .filter((item) => section === 'expected' ? item.toId === user.id : item.fromId === user.id)
    .toSorted((left, right) => right.date.localeCompare(left.date))
  const commissioned = purchases
    .filter(isOrdinaryCommissionedPurchase)
    .filter((item) => section === 'expected' ? item.payerId === user.id : item.recipientId === user.id)
    .toSorted((left, right) => right.purchaseDate.localeCompare(left.purchaseDate))
  const respondToPurchase = async (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => {
    if (!onRespondPurchase) return
    setBusyPurchaseId(purchase.id)
    setResponseError('')
    try { await onRespondPurchase(purchase, accepted, categoryId, accountId, category) }
    catch (reason) { setResponseError(reimbursementResponseMessage(reason)) }
    finally { setBusyPurchaseId(undefined) }
  }

  return <div className="page reimbursements-page">
    <div className="page-heading"><div><h1>Rimborsi</h1><p>Controlla i rimborsi che attendi e quelli che devi corrispondere.</p></div></div>
    <div className="tabs reimbursement-tabs" role="tablist" aria-label="Tipo di rimborso">
      <button type="button" role="tab" aria-selected={section === 'expected'} className={section === 'expected' ? 'active' : ''} onClick={() => setSection('expected')}>Attesi</button>
      <button type="button" role="tab" aria-selected={section === 'owed'} className={section === 'owed' ? 'active' : ''} onClick={() => setSection('owed')}>Dovuti</button>
    </div>
    {responseError ? <p className="form-message form-message--error" role="alert">{responseError}</p> : null}
    {reimbursements.length || commissioned.length ? <div className="reimbursement-review-list">
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
        : <CommissionedReimbursementStatus key={purchase.id} amount={purchase.amount} status={purchase.status} label={purchase.description} />)}
    </div> : <div className="empty-state"><HandCoins /><h3>Nessun rimborso {section === 'expected' ? 'atteso' : 'dovuto'}</h3><p>I movimenti compariranno qui quando verranno registrati.</p></div>}
  </div>
}

function reimbursementResponseMessage(reason: unknown) {
  const message = functionErrorMessage(reason)
  if (message.includes('reimbursement_accounts_required')) return 'Il rimborso non contiene ancora entrambi i conti necessari. Chi lo ha creato deve indicare il proprio conto e inviarlo nuovamente.'
  if (message.includes('purchase_catalog_required')) return 'Scegli la categoria prima di confermare l’acquisto.'
  if (message.includes('reimbursement_purchase_mismatch')) return 'Questo acquisto non è più collegato correttamente al rimborso. La richiesta deve essere reinviata.'
  if (message.includes('already_resolved')) return 'Questa richiesta è già stata gestita. Aggiorna la pagina per vedere lo stato corrente.'
  return message || 'Non è stato possibile confermare il rimborso. Riprova tra poco.'
}

function CommissionedReimbursementStatus({ amount, status, label }: {
  amount: number
  status: CommissionedPurchase['status']
  label: string
}) {
  const state = status === 'pending' ? 'In attesa di conferma' : status === 'confirmed' ? 'Confermato e registrato' : 'Rifiutato'
  return <article className={`reimbursement-review ${status === 'rejected' ? 'reimbursement-review--rejected' : ''}`}><span><HandCoins /></span><div><strong>{label}</strong><small>{formatMoney(amount)} · {state}</small></div></article>
}
