export const formatMoney = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))

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

export function splitAmount(value: number, count: number) {
  const cents = Math.round(value * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100)
}
