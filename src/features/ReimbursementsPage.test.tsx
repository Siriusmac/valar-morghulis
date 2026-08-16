// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { ReimbursementsPage } from './ReimbursementsPage'

afterEach(cleanup)

describe('ReimbursementsPage', () => {
  it('separates expected reimbursements from owed reimbursements', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [
      { id: 'expected', fromId: users[1].id, toId: users[0].id, amount: 25, date: '2026-08-15', authorId: users[1].id, status: 'confirmed' },
      { id: 'owed', fromId: users[0].id, toId: users[1].id, amount: 40, date: '2026-08-14', authorId: users[0].id, status: 'confirmed' },
    ]

    render(<ReimbursementsPage data={data} user={users[0]} members={users} />)

    expect(screen.getByText(/25,00/)).toBeTruthy()
    expect(screen.queryByText(/40,00/)).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    expect(screen.getByText(/40,00/)).toBeTruthy()
    expect(screen.queryByText(/25,00/)).toBeNull()
  })
})
