// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { todayISO } from '../lib/format'
import type { Category } from '../types'
import { BudgetPage } from './BudgetPage'

afterEach(cleanup)

describe('BudgetPage', () => {
  it('riunisce i budget e mostra la percentuale spesa nel mese', () => {
    const data = structuredClone(defaultData)
    data.categories = data.categories.map((category) => category.id === 'alimentari' ? { ...category, monthlyBudget: 100 } : category)
    data.movements.push({ ...data.movements[0], id: 'budget-current', date: todayISO(), amount: 40, splits: undefined })

    render(<BudgetPage data={data} user={users[0]} onAdd={vi.fn()} onUpdate={vi.fn()} />)

    const row = screen.getByText('Alimentari').closest('article')!
    expect(within(row).getByText('40% utilizzato')).toBeTruthy()
    expect(within(row).getByText('su 100,00 €')).toBeTruthy()
  })

  it('crea una categoria di spesa insieme al budget e consente di eliminarlo', () => {
    const data = structuredClone(defaultData)
    data.categories = data.categories.map((category) => category.id === 'alimentari' ? { ...category, monthlyBudget: 150 } : category)
    const onAdd = vi.fn()
    const onUpdate = vi.fn()
    render(<BudgetPage data={data} user={users[0]} onAdd={onAdd} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi budget' }))
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Tempo libero' } })
    fireEvent.change(screen.getByLabelText('Importo mensile'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva budget' }))
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: 'Tempo libero', movementType: 'expense', monthlyBudget: 80, scope: 'personal' })

    const row = screen.getByText('Alimentari').closest('article')!
    fireEvent.click(within(row).getByRole('button', { name: 'Azioni per il budget Alimentari' }))
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Elimina budget' }))
    expect((onUpdate.mock.calls[0][0] as Category).monthlyBudget).toBeUndefined()
  })
})
