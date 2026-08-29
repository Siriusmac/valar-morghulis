import type { AppData, CommissionedPurchase, Contact, Movement, Sender, UserId } from '../types'

const incomeCategoryPrefix = 'category-commissioned-reimbursement-'
const incomeMovementPrefix = 'commissioned-reimbursement-'
const senderPrefix = 'sender-contact-'

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
 * Una richiesta per conto terzi è anche un rimborso: finché è pending resta
 * negli attesi/dovuti; quando il destinatario la conferma, il pagante riceve
 * un'entrata personale sullo stesso conto usato per l'acquisto.
 */
export function reconcileConfirmedCommissionedIncomes(
  data: AppData,
  purchases: CommissionedPurchase[],
  userId: UserId,
  contacts: Contact[],
): AppData {
  const confirmed = purchases.filter((purchase) =>
    purchase.payerId === userId
      && purchase.status === 'confirmed'
      && !purchase.reimbursementId,
  )
  if (!confirmed.length) return data

  let changed = false
  const movements = [...data.movements]
  const categories = [...data.categories]
  const senders = [...data.senders]
  const categoryId = `${incomeCategoryPrefix}${userId}`

  for (const purchase of confirmed) {
    const movementId = `${incomeMovementPrefix}${purchase.id}`
    if (movements.some((movement) => movement.id === movementId)) continue
    const source = movements.find((movement) => movement.id === purchase.payerMovementId)
    if (!source) continue

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
      date: purchase.purchaseDate,
      description: `Rimborso · ${purchase.description}`,
      categoryId,
      senderId,
      accountId: source.accountId,
      shared: false,
      comments: `Acquisto per conto terzi ${purchase.id}`,
      createdAt: purchase.createdAt,
    }
    movements.unshift(movement)
    changed = true
  }

  return changed ? { ...data, movements, categories, senders } : data
}

export function isOrdinaryCommissionedPurchase(purchase: CommissionedPurchase) {
  return !purchase.reimbursementId
}

export function isPurchaseReimbursement(purchase: CommissionedPurchase) {
  return Boolean(purchase.reimbursementId)
}
