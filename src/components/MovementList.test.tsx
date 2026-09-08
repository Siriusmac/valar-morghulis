// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { MovementList } from './MovementList'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MovementList account activity', () => {
  it('unisce movimenti e giri fondi in ordine di data con il segno relativo al conto', () => {
    const data = structuredClone(defaultData)
    data.transfers = [{
      id: 'transfer-account-history', authorId: 'simone',
      fromAccountId: 'simone-bank', toAccountId: 'simone-card',
      amount: 25, feeAmount: 1.5, date: '2026-07-20', description: 'Ricarica carta',
    }]
    const movements = data.movements.filter((movement) => movement.accountId === 'simone-bank')

    const { container } = render(<MovementList data={data} movements={movements} transfers={data.transfers} accountId="simone-bank" compact />)

    expect(screen.getByText('Ricarica carta')).toBeTruthy()
    expect(screen.getByText('−25,00 €')).toBeTruthy()
    expect(screen.getByText('20 lug 2026')).toBeTruthy()
    expect(screen.getByText(/spese 1,50 €/)).toBeTruthy()
    expect(container.querySelector('.movement-row')?.textContent).toContain('Ricarica carta')
  })

  it('mostra il giro fondi come entrata sul conto di destinazione', () => {
    const data = structuredClone(defaultData)
    data.transfers = [{
      id: 'transfer-account-income', authorId: 'simone',
      fromAccountId: 'simone-bank', toAccountId: 'simone-card',
      amount: 25, date: '2026-07-20', description: 'Ricarica carta',
    }]

    render(<MovementList data={data} movements={[]} transfers={data.transfers} accountId="simone-card" compact />)

    expect(screen.getByText('+25,00 €')).toBeTruthy()
    expect(screen.getByText('Da Conto corrente')).toBeTruthy()
  })

  it('consente all’autore di modificare ed eliminare movimenti e giri fondi dal conto', () => {
    const data = structuredClone(defaultData)
    const movement = data.movements.find((item) => item.authorId === users[0].id)!
    const transfer = {
      id: 'transfer-actions', authorId: users[0].id,
      fromAccountId: movement.accountId, toAccountId: 'simone-card',
      amount: 25, date: '2026-07-20', description: 'Ricarica carta',
    }
    data.transfers = [transfer]
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onEditTransfer = vi.fn()
    const onDeleteTransfer = vi.fn()
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(<MovementList data={data} movements={[movement]} transfers={[transfer]} accountId={movement.accountId} compact user={users[0]} onEdit={onEdit} onDelete={onDelete} onEditTransfer={onEditTransfer} onDeleteTransfer={onDeleteTransfer} />)

    const movementRow = screen.getByText(movement.description).closest('article')!
    fireEvent.click(within(movementRow).getByRole('button', { name: `Azioni per ${movement.description}` }))
    fireEvent.click(within(movementRow).getByRole('menuitem', { name: 'Modifica' }))
    fireEvent.click(within(movementRow).getByRole('button', { name: `Azioni per ${movement.description}` }))
    fireEvent.click(within(movementRow).getByRole('menuitem', { name: 'Elimina' }))

    const transferRow = screen.getByText('Ricarica carta').closest('article')!
    fireEvent.click(within(transferRow).getByRole('button', { name: 'Azioni per Ricarica carta' }))
    fireEvent.click(within(transferRow).getByRole('menuitem', { name: 'Modifica' }))
    fireEvent.click(within(transferRow).getByRole('button', { name: 'Azioni per Ricarica carta' }))
    fireEvent.click(within(transferRow).getByRole('menuitem', { name: 'Elimina' }))

    expect(onEdit).toHaveBeenCalledWith(movement)
    expect(onDelete).toHaveBeenCalledWith(movement.id)
    expect(onEditTransfer).toHaveBeenCalledWith(transfer)
    expect(onDeleteTransfer).toHaveBeenCalledWith(transfer.id)
  })

  it('impedisce di modificare o eliminare un giro fondi creato da un altro membro', () => {
    const data = structuredClone(defaultData)
    const transfer = {
      id: 'transfer-other-author', authorId: users[1].id,
      fromAccountId: 'family-account', toAccountId: 'anna-bank',
      amount: 25, date: '2026-07-20', description: 'Giro di Anna',
    }

    render(<MovementList data={data} movements={[]} transfers={[transfer]} accountId="family-account" compact user={users[0]} onEditTransfer={vi.fn()} onDeleteTransfer={vi.fn()} />)

    const row = screen.getByText('Giro di Anna').closest('article')!
    fireEvent.click(within(row).getByRole('button', { name: 'Azioni per Giro di Anna' }))
    expect((within(row).getByRole('menuitem', { name: 'Modifica' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(row).getByRole('menuitem', { name: 'Elimina' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
