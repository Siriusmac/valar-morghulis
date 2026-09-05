import type { AppData, CommissionedPurchase, Contact, Movement, Sender, UserId } from '../types'

const incomeCategoryPrefix = 'category-commissioned-reimbursement-'
const incomeMovementPrefix = 'commissioned-reimbursement-'
const senderPrefix = 'sender-contact-'
const beneficiaryPrefix = 'beneficiary-contact-'

export const debtCompensationAccountId = 'family-debt-compensation'
export const debtCompensationAccountLabel = 'Compensazione debito'

/**
 * La spesa catalogata dal destinatario rappresenta la compensazione, non
 * l'addebito reale del pagante. Una rettifica approvata ne aggiorna importo e
 * data; un annullamento la rimuove dalle statistiche private del destinatario.
 */
export function reconcilePurchaseReimbursementMovements(data: AppData): AppData {
  const reimbursements = new Map(data.reimbursements
    .filter((item) => item.settlementMethod === 'purchase' && item.commissionedPurchaseId)
    .map((item) => [item.commissionedPurchaseId!, item]))
  if (!reimbursements.size) return data

  let changed = false
  const movements = data.movements.flatMap((movement) => {
    if (!movement.paidByUserId || !movement.commissionedPurchaseId) return [movement]
    const reimbursement = reimbursements.get(movement.commissionedPurchaseId)
    if (!reimbursement) return [movement]
    if (reimbursement.status === 'cancelled') {
      changed = true
      return []
    }
    if ((reimbursement.status === undefined || reimbursement.status === 'confirmed')
      && (movement.amount !== reimbursement.amount || movement.date !== reimbursement.date)) {
      changed = true
      return [{ ...movement, amount: reimbursement.amount, date: reimbursement.date }]
    }
    return [movement]
  })
  return changed ? { ...data, movements } : data
}

/**
 * Riconcilia le scritture private di un acquisto per conto terzi con le due
 * conferme del rimborso. L'addebito nasce quando il destinatario emette il
 * rimborso; l'entrata nasce soltanto quando il pagante ne conferma l'incasso.
 * Un rimborso annullato rimuove entrambe le scritture collegate.
 */
export function reconcileConfirmedCommissionedIncomes(
  data: AppData,
  purchases: CommissionedPurchase[],
  userId: UserId,
  contacts: Contact[],
): AppData {
  const ordinary = purchases.filter((purchase) => !purchase.reimbursementId)
  const byId = new Map(ordinary.map((purchase) => [purchase.id, purchase]))
  let changed = false
  const movements = data.movements.filter((movement) => {
    if (movement.id.startsWith(incomeMovementPrefix)) {
      const purchase = ordinary.find((item) => movement.id === `${incomeMovementPrefix}${item.id}`)
      const keep = Boolean(purchase && purchase.payerId === userId && purchase.status === 'confirmed' && purchase.reimbursementStatus === 'confirmed')
      if (!keep) changed = true
      return keep
    }
    if (movement.commissionedPurchaseId && movement.authorId === userId) {
      const purchase = byId.get(movement.commissionedPurchaseId)
      if (purchase?.recipientId === userId && purchase.reimbursementStatus === 'cancelled') {
        changed = true
        return false
      }
    }
    return true
  })
  const categories = [...data.categories]
  const senders = [...data.senders]
  const beneficiaries = [...data.beneficiaries]
  const categoryId = `${incomeCategoryPrefix}${userId}`

  const issued = ordinary.filter((purchase) => purchase.recipientId === userId
    && purchase.status === 'confirmed'
    && (purchase.reimbursementStatus === 'pending' || purchase.reimbursementStatus === 'confirmed'))
  for (const purchase of issued) {
    if (!purchase.recipientMovementId || !purchase.recipientCategoryId || !purchase.reimbursementSourceAccountId) continue
    const existingIndex = movements.findIndex((movement) => movement.id === purchase.recipientMovementId)
    const existing = movements[existingIndex]
    const date = interactionDate(purchase.reimbursementIssuedAt, purchase.purchaseDate)
    if (existing) {
      if (existing.accountId !== purchase.reimbursementSourceAccountId || existing.amount !== purchase.amount || existing.date !== date) {
        movements[existingIndex] = { ...existing, accountId: purchase.reimbursementSourceAccountId, amount: purchase.amount, date }
        changed = true
      }
      continue
    }
    const beneficiaryId = `${beneficiaryPrefix}${purchase.payerId}`
    if (!beneficiaries.some((beneficiary) => beneficiary.id === beneficiaryId)) {
      const contact = contacts.find((item) => item.id === purchase.payerId)
      beneficiaries.push({ id: beneficiaryId, name: contact?.name ?? 'Contatto', scope: 'personal', ownerId: userId })
    }
    movements.unshift({
      id: purchase.recipientMovementId,
      type: 'expense',
      authorId: userId,
      memberId: userId,
      amount: purchase.amount,
      date,
      description: purchase.description,
      categoryId: purchase.recipientCategoryId,
      beneficiaryId,
      accountId: purchase.reimbursementSourceAccountId,
      shared: false,
      commissionedPurchaseId: purchase.id,
      paidByUserId: purchase.payerId,
      comments: `Rimborso per acquisto conto terzi ${purchase.id}`,
      createdAt: purchase.reimbursementIssuedAt ?? purchase.createdAt,
    })
    changed = true
  }

  const confirmed = ordinary.filter((purchase) => purchase.payerId === userId
    && purchase.status === 'confirmed'
    && purchase.reimbursementStatus === 'confirmed'
    && purchase.reimbursementDestinationAccountId)
  for (const purchase of confirmed) {
    const destinationAccountId = purchase.reimbursementDestinationAccountId!
    const movementId = `${incomeMovementPrefix}${purchase.id}`
    const existingIndex = movements.findIndex((movement) => movement.id === movementId)
    const existing = movements[existingIndex]
    const date = interactionDate(purchase.reimbursementConfirmedAt, purchase.purchaseDate)
    if (existing) {
      if (existing.accountId !== destinationAccountId || existing.amount !== purchase.amount || existing.date !== date) {
        movements[existingIndex] = { ...existing, accountId: destinationAccountId, amount: purchase.amount, date }
        changed = true
      }
      continue
    }

    const senderId = purchase.recipientId ? `${senderPrefix}${purchase.recipientId}` : undefined
    if (senderId && !senders.some((sender) => sender.id === senderId)) {
      const contact = contacts.find((item) => item.id === purchase.recipientId)
      const sender: Sender = {
        id: senderId,
        name: contact?.name ?? 'Contatto',
        scope: 'personal',
        ownerId: userId,
      }
      senders.push(sender)
    }
    if (!categories.some((category) => category.id === categoryId)) {
      categories.push({
        id: categoryId,
        name: 'Rimborsi ricevuti',
        scope: 'personal',
        ownerId: userId,
        movementType: 'income',
        color: '#3f7650',
      })
    }

    const movement: Movement = {
      id: movementId,
      type: 'income',
      authorId: userId,
      memberId: userId,
      amount: purchase.amount,
      date,
      description: `Rimborso · ${purchase.description}`,
      categoryId,
      senderId,
      accountId: destinationAccountId,
      shared: false,
      comments: `Acquisto per conto terzi ${purchase.id}`,
      createdAt: purchase.reimbursementConfirmedAt ?? purchase.createdAt,
    }
    movements.unshift(movement)
    changed = true
  }

  return changed ? { ...data, movements, categories, senders, beneficiaries } : data
}

function interactionDate(timestamp: string | undefined, fallback: string) {
  return timestamp?.slice(0, 10) || fallback
}

export function isOrdinaryCommissionedPurchase(purchase: CommissionedPurchase) {
  return !purchase.reimbursementId
}

export function isPurchaseReimbursement(purchase: CommissionedPurchase) {
  return Boolean(purchase.reimbursementId)
}
