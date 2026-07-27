// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MovementList } from '../components/MovementList'
import { defaultData, users } from '../lib/seed'
import type { Beneficiary, Sender } from '../types'
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
        onAddBeneficiary={vi.fn()}
        onUpdateBeneficiary={onUpdate}
        onDeleteBeneficiary={vi.fn()}
        onAddSender={vi.fn()}
        onUpdateSender={vi.fn()}
        onDeleteSender={vi.fn()}
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

  it('switches to senders and keeps their identity when the name changes', () => {
    const data = structuredClone(defaultData)
    const onUpdateSender = vi.fn()
    render(
      <BeneficiariesPage
        data={data}
        user={users[0]}
        onAddBeneficiary={vi.fn()}
        onUpdateBeneficiary={vi.fn()}
        onDeleteBeneficiary={vi.fn()}
        onAddSender={vi.fn()}
        onUpdateSender={onUpdateSender}
        onDeleteSender={vi.fn()}
        onShowMovements={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mittenti' }))
    const senderCard = screen.getByText('Datore di lavoro').closest('article')!
    fireEvent.click(within(senderCard).getByTitle('Modifica nome'))
    fireEvent.change(screen.getByLabelText('Nome mittente Datore di lavoro'), { target: { value: 'Alfred Home Solutions' } })
    fireEvent.click(within(senderCard).getByTitle('Salva nome'))

    const updatedSender = onUpdateSender.mock.calls[0][0] as Sender
    expect(updatedSender).toMatchObject({ id: 'datore-lavoro', name: 'Alfred Home Solutions' })
    expect(data.movements.find((movement) => movement.id === 'seed-4')?.senderId).toBe('datore-lavoro')
  })

  it('deletes a beneficiary and lets the user reassign its movements', () => {
    const onDeleteBeneficiary = vi.fn()
    render(
      <BeneficiariesPage
        data={structuredClone(defaultData)}
        user={users[0]}
        onAddBeneficiary={vi.fn()}
        onUpdateBeneficiary={vi.fn()}
        onDeleteBeneficiary={onDeleteBeneficiary}
        onAddSender={vi.fn()}
        onUpdateSender={vi.fn()}
        onDeleteSender={vi.fn()}
        onShowMovements={vi.fn()}
      />,
    )

    const lidlCard = screen.getByText('Lidl').closest('article')!
    fireEvent.click(within(lidlCard).getByTitle('Elimina beneficiario'))
    fireEvent.change(screen.getByLabelText('Attribuisci i movimenti a'), { target: { value: 'eurospar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))

    expect(onDeleteBeneficiary).toHaveBeenCalledWith('lidl', 'eurospar')
  })

  it('deletes a sender and can leave its movements without a sender', () => {
    const onDeleteSender = vi.fn()
    render(
      <BeneficiariesPage
        data={structuredClone(defaultData)}
        user={users[0]}
        onAddBeneficiary={vi.fn()}
        onUpdateBeneficiary={vi.fn()}
        onDeleteBeneficiary={vi.fn()}
        onAddSender={vi.fn()}
        onUpdateSender={vi.fn()}
        onDeleteSender={onDeleteSender}
        onShowMovements={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mittenti' }))
    const senderCard = screen.getByText('Datore di lavoro').closest('article')!
    fireEvent.click(within(senderCard).getByTitle('Elimina mittente'))
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))

    expect(onDeleteSender).toHaveBeenCalledWith('datore-lavoro', undefined)
  })

  it('groups movements without a beneficiary in a dedicated row', () => {
    const data = structuredClone(defaultData)
    data.movements[0].beneficiaryId = undefined
    render(
      <BeneficiariesPage
        data={data}
        user={users[0]}
        onAddBeneficiary={vi.fn()}
        onUpdateBeneficiary={vi.fn()}
        onDeleteBeneficiary={vi.fn()}
        onAddSender={vi.fn()}
        onUpdateSender={vi.fn()}
        onDeleteSender={vi.fn()}
        onShowMovements={vi.fn()}
      />,
    )

    expect(screen.getByText('Nessun beneficiario')).toBeTruthy()
  })
})
