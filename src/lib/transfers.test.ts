import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { deleteTransferData, saveTransferData } from './transfers'

const originalTransfer = {
  id: 'transfer-editable', authorId: 'simone' as const,
  fromAccountId: 'simone-bank', toAccountId: 'simone-card',
  amount: 25, date: '2026-07-20', description: 'Ricarica carta',
}

describe('transfer data changes', () => {
  it('aggiorna un giro fondi esistente senza duplicarlo', () => {
    const data = { ...structuredClone(defaultData), transfers: [originalTransfer] }
    const updated = saveTransferData(data, { ...originalTransfer, amount: 40, description: 'Ricarica aggiornata' })

    expect(updated.transfers).toHaveLength(1)
    expect(updated.transfers[0]).toMatchObject({ id: originalTransfer.id, amount: 40, description: 'Ricarica aggiornata' })
  })

  it('elimina il giro fondi e lascia invariati gli altri dati', () => {
    const data = { ...structuredClone(defaultData), transfers: [originalTransfer] }
    const updated = deleteTransferData(data, originalTransfer.id)

    expect(updated.transfers).toEqual([])
    expect(updated.movements).toEqual(data.movements)
  })
})
