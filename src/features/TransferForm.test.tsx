// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { TransferForm } from './TransferForm'

afterEach(cleanup)

function submitAmount(amount: string) {
  const onSubmit = vi.fn()
  const { container } = render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)
  fireEvent.change(container.querySelector('input[inputmode="decimal"]')!, { target: { value: amount } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))
  cleanup()
  return onSubmit
}

describe('TransferForm', () => {
  it('keeps the three movement choices and can return to an expense', () => {
    const onSelectMovement = vi.fn()
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={vi.fn()} onCancel={vi.fn()} onSelectMovement={onSelectMovement} />)

    expect(screen.getByRole('button', { name: 'Giro fondi' }).className).toContain('active')
    fireEvent.click(screen.getByRole('button', { name: 'Spesa' }))
    expect(onSelectMovement).toHaveBeenCalledWith('expense')
  })

  it.each(['NaN', 'Infinity'])('rifiuta un importo non finito: %s', (amount) => {
    expect(submitAmount(amount)).not.toHaveBeenCalled()
  })

  it.each(['0', '-1'])('rifiuta zero e importi negativi: %s', (amount) => {
    expect(submitAmount(amount)).not.toHaveBeenCalled()
  })

  it('accetta un importo numerico positivo', () => {
    const onSubmit = submitAmount('12,50')
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0][0].amount).toBe(12.5)
  })
})
