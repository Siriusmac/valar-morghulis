export const formatMoney = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))

const monthYearFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

export const formatMonthYear = (month: string) =>
  monthYearFormatter.format(new Date(`${month}-01T12:00:00`))

export const todayISO = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function addMonthsISO(value: string, months: number) {
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  const targetYear = target.getFullYear()
  const targetMonth = String(target.getMonth() + 1).padStart(2, '0')
  const targetDay = String(target.getDate()).padStart(2, '0')
  return `${targetYear}-${targetMonth}-${targetDay}`
}

export function selectableMonths(dates: string[], selectedMonth: string, currentMonth = todayISO().slice(0, 7)) {
  return [...new Set([
    ...Array.from({ length: 37 }, (_, index) => addMonthsISO(`${currentMonth}-01`, index - 24).slice(0, 7)),
    ...dates.map((date) => date.slice(0, 7)),
    selectedMonth,
  ])].toSorted((a, b) => b.localeCompare(a))
}

export function splitAmount(value: number, count: number) {
  const cents = Math.round(value * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100)
}

export function splitAllocationsAcrossInstallments(allocationAmounts: number[], installmentAmounts: number[]) {
  const remaining = allocationAmounts.map((amount) => Math.round(amount * 100))
  const installmentCents = installmentAmounts.map((amount) => Math.round(amount * 100))
  return installmentCents.map((installment, installmentIndex) => {
    if (installmentIndex === installmentCents.length - 1) return remaining.map((amount) => amount / 100)
    const remainingTotal = remaining.reduce((sum, amount) => sum + amount, 0)
    if (!remainingTotal) return remaining.map(() => 0)
    const exact = remaining.map((amount) => (amount * installment) / remainingTotal)
    const row = exact.map((amount, index) => Math.min(remaining[index], Math.floor(amount)))
    let centsToAssign = installment - row.reduce((sum, amount) => sum + amount, 0)
    const priority = exact
      .map((amount, index) => ({ index, fraction: amount - Math.floor(amount) }))
      .toSorted((a, b) => b.fraction - a.fraction || a.index - b.index)
    for (const { index } of priority) {
      if (!centsToAssign) break
      if (row[index] >= remaining[index]) continue
      row[index] += 1
      centsToAssign -= 1
    }
    row.forEach((amount, index) => { remaining[index] -= amount })
    return row.map((amount) => amount / 100)
  })
}
