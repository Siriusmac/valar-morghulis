// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultData } from '../lib/seed'
import { MovementList } from './MovementList'

afterEach(cleanup)

describe('MovementList account activity', () => {
  it('unisce movimenti e giri fondi in ordine di data con il segno relativo al conto', () => {
    const data = structuredClone(defaultData)
    data.transfers = [{
      id: 'transfer-account-history', authorId: 'simone',
      fromAccountId: 'simone-bank', toAccountId: 'simone-card',
      amount: 25, date: '2026-07-20', description: 'Ricarica carta',
    }]
    const movements = data.movements.filter((movement) => movement.accountId === 'simone-bank')

    const { container } = render(<MovementList data={data} movements={movements} transfers={data.transfers} accountId="simone-bank" compact />)

    expect(screen.getByText('Ricarica carta')).toBeTruthy()
    expect(screen.getByText('−25,00 €')).toBeTruthy()
    expect(screen.getByText('20 lug 2026')).toBeTruthy()
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
})
