// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { ScheduledPaymentsPage } from './ScheduledPaymentsPage'

afterEach(cleanup)

describe('ScheduledPaymentsPage', () => {
  it('shows the plan start date, the complete installment and plan actions', () => {
    const data = structuredClone(defaultData)
    const firstMovement = data.movements.find((item) => item.installmentPlanId === 'seed-plan')!
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ScheduledPaymentsPage data={data} user={users[0]} onEdit={onEdit} onDelete={onDelete} />)

    expect(screen.getByText(/iniziato il 12 lug 2026/)).toBeTruthy()
    expect(screen.getAllByText('Rata completa')).toHaveLength(2)
    expect(screen.getAllByText(/40,00/)).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Modifica Accessori casa/ }))
    expect(onEdit).toHaveBeenCalledWith(firstMovement)
    fireEvent.click(screen.getByRole('button', { name: /Elimina Accessori casa/ }))
    expect(onDelete).toHaveBeenCalledWith(firstMovement.id)
  })
})
