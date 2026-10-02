// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { ScheduledPaymentsPage } from './ScheduledPaymentsPage'

afterEach(cleanup)

describe('ScheduledPaymentsPage', () => {
  it('creates an editable recurring expense and confirms it when due', () => {
    const data = structuredClone(defaultData)
    data.recurringMovements = [{
      id: 'rent', authorId: users[0].id, memberId: users[0].id, type: 'expense', amount: 800,
      amountMode: 'variable', nextDate: '2026-01-01', frequency: 'monthly', description: 'Affitto',
      categoryId: 'mutuo', accountId: 'simone-bank', shared: false, status: 'active', createdAt: '2026-01-01T00:00:00Z',
    }]
    const onConfirmRecurring = vi.fn()
    const onSaveRecurring = vi.fn()
    render(<ScheduledPaymentsPage data={data} user={users[0]} onEdit={vi.fn()} onDelete={vi.fn()} onSaveRecurring={onSaveRecurring} onDeleteRecurring={vi.fn()} onToggleRecurring={vi.fn()} onSkipRecurring={vi.fn()} onConfirmRecurring={onConfirmRecurring} />)

    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
    expect(onConfirmRecurring).toHaveBeenCalledWith(expect.objectContaining({ id: 'rent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo ricorrente' }))
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Bolletta gas' } })
    fireEvent.change(screen.getByLabelText('Importo indicativo'), { target: { value: '75,50' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'luce' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crea ricorrenza' }))
    expect(onSaveRecurring).toHaveBeenCalledWith(expect.objectContaining({ description: 'Bolletta gas', amount: 75.5, type: 'expense', amountMode: 'variable' }))
  })

  it('shows the plan start date, the complete installment and plan actions', () => {
    const data = structuredClone(defaultData)
    const firstMovement = data.movements.find((item) => item.installmentPlanId === 'seed-plan')!
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ScheduledPaymentsPage data={data} user={users[0]} onEdit={onEdit} onDelete={onDelete} onSaveRecurring={vi.fn()} onDeleteRecurring={vi.fn()} onToggleRecurring={vi.fn()} onSkipRecurring={vi.fn()} onConfirmRecurring={vi.fn()} />)

    expect(screen.getByText(/iniziato il 12 lug 2026/)).toBeTruthy()
    expect(screen.getByText('Importo totale')).toBeTruthy()
    expect(screen.getByText(/120,00/)).toBeTruthy()
    expect(screen.getAllByText('Rata completa')).toHaveLength(2)
    expect(screen.getAllByText(/40,00/)).toHaveLength(2)

    const plan = screen.getByText('Accessori casa').closest('section')!
    fireEvent.click(within(plan).getByRole('button', { name: 'Azioni per Accessori casa' }))
    fireEvent.click(within(plan).getByRole('menuitem', { name: 'Modifica' }))
    expect(onEdit).toHaveBeenCalledWith(firstMovement)
    fireEvent.click(within(plan).getByRole('button', { name: 'Azioni per Accessori casa' }))
    fireEvent.click(within(plan).getByRole('menuitem', { name: 'Elimina' }))
    expect(onDelete).toHaveBeenCalledWith(firstMovement.id)
  })
})
