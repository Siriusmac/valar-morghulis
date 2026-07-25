// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MovementList } from '../components/MovementList'
import { defaultData, users } from '../lib/seed'
import type { Beneficiary } from '../types'
import { BeneficiariesPage } from './ManagementPages'

afterEach(cleanup)

describe('BeneficiariesPage', () => {
  it('keeps the beneficiary identity so historical movements show the updated name', () => {
    const data = structuredClone(defaultData)
    const onUpdate = vi.fn()
    render(
      <BeneficiariesPage
        data={data}
        user={users[0]}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onShowMovements={vi.fn()}
      />,
    )

    const lidlCard = screen.getByText('Lidl').closest('article')!
    fireEvent.click(within(lidlCard).getByTitle('Modifica nome'))
    fireEvent.change(screen.getByLabelText('Nome beneficiario Lidl'), { target: { value: 'Lidl Italia' } })
    fireEvent.click(within(lidlCard).getByTitle('Salva nome'))

    expect(onUpdate).toHaveBeenCalledOnce()
    const updatedBeneficiary = onUpdate.mock.calls[0][0] as Beneficiary
    expect(updatedBeneficiary).toMatchObject({ id: 'lidl', name: 'Lidl Italia' })

    cleanup()
    const updatedData = {
      ...data,
      beneficiaries: data.beneficiaries.map((item) => item.id === updatedBeneficiary.id ? updatedBeneficiary : item),
    }
    const historicalMovement = data.movements.find((movement) => movement.id === 'seed-1')!
    render(<MovementList data={updatedData} movements={[historicalMovement]} />)

    expect(screen.getByText(/Lidl Italia/)).toBeTruthy()
    expect(historicalMovement.beneficiaryId).toBe('lidl')
  })
})
