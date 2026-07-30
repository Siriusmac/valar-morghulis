// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { defaultData, users } from '../lib/seed'
import { todayISO } from '../lib/format'

afterEach(cleanup)
describe('Dashboard workspace selector', () => {
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

  it('lets the counterparty choose their account and confirm a pending reimbursement', async () => {
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
    const onRespond = vi.fn().mockResolvedValue(undefined)
    render(<Dashboard data={data} user={users[0]} members={users} onNavigate={vi.fn()} onReimburse={vi.fn()} onRespondReimbursement={onRespond} />)

    expect(screen.getByText(/ha registrato un rimborso di/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Il tuo conto di origine'), { target: { value: 'simone-cash' } })
    fireEvent.click(screen.getByRole('button', { name: /Conferma/ }))

    await waitFor(() => expect(onRespond).toHaveBeenCalledWith('pending-reimbursement', true, 'simone-cash'))
  })
})
