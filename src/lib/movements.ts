import type { AppData, Beneficiary, Category, Movement, ScheduledPayment, Sender, Tag } from '../types'

export interface MovementAdditions {
  category?: Category
  beneficiary?: Beneficiary
  sender?: Sender
  tag?: Tag
  scheduledPayments?: ScheduledPayment[]
}

export function saveMovementData(current: AppData, movement: Movement, additions: MovementAdditions): AppData {
  // Gli snapshot importati possono contenere lo stesso movimento con ID diversi:
  // autore e istante di creazione ne mantengono stabile l'identità durante l'editing.
  const matchesMovement = (item: Movement) => item.id === movement.id
    || (item.authorId === movement.authorId && item.createdAt === movement.createdAt)
  const previous = current.movements.find(matchesMovement)
  let scheduledPayments = additions.scheduledPayments?.length
    ? [...current.scheduledPayments, ...additions.scheduledPayments]
    : current.scheduledPayments

  // Le modifiche anagrafiche alla prima rata restano coerenti anche sulle rate non ancora scadute.
  if (previous?.installmentPlanId && previous.installmentNumber === 1) {
    const description = stripInstallmentSuffix(movement.description)
    scheduledPayments = scheduledPayments.map((payment) => payment.planId === previous.installmentPlanId && payment.status === 'scheduled'
      ? {
          ...payment,
          description,
          categoryId: movement.categoryId,
          beneficiaryId: movement.beneficiaryId,
          accountId: movement.accountId,
          tagId: movement.tagId,
          comments: movement.comments,
          shared: movement.shared,
        }
      : payment)
  }

  return {
    ...current,
    categories: additions.category ? [...current.categories, additions.category] : current.categories,
    beneficiaries: additions.beneficiary ? [...current.beneficiaries, additions.beneficiary] : current.beneficiaries,
    senders: additions.sender ? [...current.senders, additions.sender] : current.senders,
    tags: additions.tag ? [...current.tags, additions.tag] : current.tags,
    scheduledPayments,
    movements: previous
      ? replaceMovementAndRemoveDuplicates(current.movements, movement, matchesMovement)
      : [movement, ...current.movements],
  }
}

export function deleteMovementData(current: AppData, movementId: string): AppData {
  const target = current.movements.find((item) => item.id === movementId)
  if (!target) return current

  const deletesWholePlan = Boolean(target.installmentPlanId && target.installmentNumber === 1)
  const movements = deletesWholePlan
    ? current.movements.filter((item) => item.installmentPlanId !== target.installmentPlanId)
    : current.movements.filter((item) => item.id !== movementId)
  const scheduledPayments = deletesWholePlan
    ? current.scheduledPayments.filter((payment) => payment.planId !== target.installmentPlanId)
    : current.scheduledPayments.filter((payment) => payment.paidMovementId !== movementId)

  return { ...current, movements, scheduledPayments }
}

function stripInstallmentSuffix(description: string) {
  return description.replace(/\s*·\s*rata\s+\d+\/\d+\s*$/i, '').trim()
}

function replaceMovementAndRemoveDuplicates(
  movements: Movement[],
  replacement: Movement,
  matches: (movement: Movement) => boolean,
) {
  let replaced = false
  return movements.flatMap((movement) => {
    if (!matches(movement)) return [movement]
    if (replaced) return []
    replaced = true
    return [replacement]
  })
}
