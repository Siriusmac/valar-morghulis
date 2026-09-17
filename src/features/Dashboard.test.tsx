// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { defaultData, users } from '../lib/seed'
import { todayISO } from '../lib/format'

afterEach(cleanup)
describe('Dashboard workspace selector', () => {
  it('avvisa al 90% del budget e permette di scalare lo sforamento dal mese seguente', () => {
    const data = structuredClone(defaultData)
    const currentMonth = todayISO().slice(0, 7)
    const category = data.categories.find((item) => item.id === 'alimentari')!
    category.monthlyBudget = 100
    category.scope = 'personal'
    data.movements = [{ ...data.movements[0], amount: 110, date: `${currentMonth}-02`, shared: false, memberId: users[0].id, authorId: users[0].id }]
    const onUpdateCategory = vi.fn()

    render(<Dashboard data={data} user={users[0]} members={users} onNavigate={vi.fn()} onReimburse={vi.fn()} onUpdateCategory={onUpdateCategory} />)

    expect(screen.getByText('Budget superato per Alimentari')).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'Budget Alimentari' }).getAttribute('aria-valuetext')).toBe('110% utilizzato')
    fireEvent.click(screen.getByRole('button', { name: 'Scala eccedenza' }))
    expect(onUpdateCategory).toHaveBeenCalledWith(expect.objectContaining({ budgetCarryovers: expect.objectContaining({}) }))
    expect(Object.values(onUpdateCategory.mock.calls[0][0].budgetCarryovers)).toContain(10)
  })

  it('uses first names in the greeting and two-member balance summary', () => {
    const data = structuredClone(defaultData)
    const currentUser = { ...users[0], name: 'Simone Miotto' }
    const otherUser = { ...users[1], name: 'Anna Bianchi' }
    data.movements = [{
      ...data.movements[0],
      id: 'shared-debt',
      amount: 100,
      memberId: otherUser.id,
      authorId: otherUser.id,
      accountId: 'anna-bank',
      shared: true,
    }]

    render(<Dashboard data={data} user={currentUser} members={[currentUser, otherUser]} onNavigate={vi.fn()} onReimburse={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Ciao, Simone' })).toBeTruthy()
    expect(screen.getByText('Devi a Anna')).toBeTruthy()
    expect(screen.queryByText(/Simone Miotto/)).toBeNull()
    expect(screen.queryByText(/Devi a Anna Bianchi/)).toBeNull()
  })

  it('switches the shared dashboard between families', async () => {
    const onSwitch = vi.fn().mockResolvedValue(undefined)
    render(<Dashboard data={structuredClone(defaultData)} user={users[0]} members={users} onNavigate={vi.fn()} onReimburse={vi.fn()} workspace={{
      familyId: 'family-one',
      families: [{ id: 'family-one', name: 'Famiglia Uno', role: 'admin' }, { id: 'family-two', name: 'Famiglia Due', role: 'member' }],
      personalMode: false,
      onSwitch,
    }} />)
    fireEvent.change(screen.getByLabelText('Vista condivisa'), { target: { value: 'family-two' } })
    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith('family-two'))
  })

  it('hides shared balances in the personal workspace', () => {
    render(<Dashboard data={structuredClone(defaultData)} user={users[0]} members={[users[0]]} onNavigate={vi.fn()} onReimburse={vi.fn()} workspace={{
      familyId: 'personal',
      families: [{ id: 'family-one', name: 'Famiglia Uno', role: 'admin' }],
      personalMode: true,
      onSwitch: vi.fn(),
    }} />)
    expect(screen.getByRole('heading', { name: 'Contabilità personale' })).toBeTruthy()
    expect(screen.queryByText('Spese condivise giornaliere')).toBeNull()
    expect(screen.queryByText('Ultimi movimenti condivisi')).toBeNull()
  })

  it('shows how much each member advanced for shared expenses in the current month', () => {
    const data = structuredClone(defaultData)
    const currentMonth = todayISO().slice(0, 7)
    data.movements = [
      { ...data.movements[0], id: 'simone-current', amount: 35, date: `${currentMonth}-02`, accountId: 'simone-bank', memberId: 'simone', authorId: 'simone', shared: true },
      { ...data.movements[1], id: 'anna-current', amount: 65, date: `${currentMonth}-03`, accountId: 'anna-bank', memberId: 'anna', authorId: 'anna', shared: true },
      { ...data.movements[2], id: 'family-current', amount: 90, date: `${currentMonth}-04`, accountId: 'family-bank', memberId: 'simone', authorId: 'simone', shared: true },
    ]
    render(<Dashboard data={data} user={users[0]} members={users} onNavigate={vi.fn()} onReimburse={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Per persona' }))

    expect(screen.getByRole('img', { name: /Simone: 35,00/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Anna: 65,00/ })).toBeTruthy()
    expect(screen.getByText('Sono escluse le spese pagate direttamente con un conto condiviso.')).toBeTruthy()
  })

  it('changes the month used by both shared-expense chart views', () => {
    const data = structuredClone(defaultData)
    data.movements = [
      { ...data.movements[0], id: 'june', amount: 42, date: '2026-06-05', accountId: 'simone-bank', memberId: 'simone', authorId: 'simone', shared: true },
    ]
    render(<Dashboard data={data} user={users[0]} members={users} onNavigate={vi.fn()} onReimburse={vi.fn()} />)

    const monthSelector = screen.getByLabelText('Mese del grafico condiviso') as HTMLSelectElement
    expect(monthSelector.tagName).toBe('SELECT')
    expect(monthSelector.closest('.dashboard-heading-actions')).toBeTruthy()
    expect(document.querySelector('.monthly-chart__controls select')).toBeNull()
    expect(document.querySelector('.date-caption')).toBeNull()
    expect(document.querySelector('.monthly-chart .section-title-row > span')).toBeNull()
    fireEvent.change(screen.getByLabelText('Mese del grafico condiviso'), { target: { value: '2026-06' } })
    expect(screen.getByRole('img', { name: /05 giugno: 42,00/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Per persona' }))
    expect(screen.getByRole('img', { name: /Simone: 42,00/ })).toBeTruthy()
  })

  it('shows actionable reimbursements first and opens the reimbursements page', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'pending-reimbursement',
      fromId: users[0].id,
      toId: users[1].id,
      amount: 25,
      date: '2026-07-27',
      authorId: users[1].id,
      status: 'pending',
    }]
    const onNavigate = vi.fn()
    render(<Dashboard data={data} user={users[0]} members={users} onNavigate={onNavigate} onReimburse={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Notifiche' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Rimborso da confermare/ }))

    expect(onNavigate).toHaveBeenCalledWith('reimbursements')
  })

  it('shows received purchases and issued purchase reimbursements that require confirmation', () => {
    const data = structuredClone(defaultData)
    const purchases = [{
      id: 'received-purchase', payerId: users[1].id, recipientId: users[0].id, payerMovementId: 'movement-1', amount: 42,
      purchaseDate: '2026-07-27', description: 'Farmaci', status: 'pending' as const, createdAt: '2026-07-27T12:00:00Z',
    }, {
      id: 'received-reimbursement', payerId: users[0].id, recipientId: users[1].id, payerMovementId: 'movement-2', amount: 18,
      purchaseDate: '2026-07-28', description: 'Cena', status: 'confirmed' as const, reimbursementStatus: 'pending' as const, createdAt: '2026-07-28T12:00:00Z',
    }]
    render(<Dashboard data={data} user={users[0]} members={users} purchases={purchases} onNavigate={vi.fn()} onReimburse={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Acquisto ricevuto da confermare/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Rimborso ricevuto da confermare/ })).toBeTruthy()
  })
})
