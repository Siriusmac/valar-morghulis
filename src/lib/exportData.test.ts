import { describe, expect, it } from 'vitest'
import { serializeAccountExport, type AccountExportData } from './exportData'

const data: AccountExportData = {
  exportedAt: '2026-07-27T10:00:00.000Z',
  profile: { id: 'user-1', name: 'Simone & Anna', email: 'test@example.com', initials: 'SA' },
  personalData: { movements: [{
    id: 'movement-1', type: 'expense', authorId: 'user-1', memberId: 'user-1',
    amount: 30, date: '2026-07-27', description: 'Casa, luce', categoryId: 'category-1',
    beneficiaryId: 'beneficiary-1', accountId: 'account-1', shared: false,
    createdAt: '2026-07-27T10:00:00.000Z',
  }] },
  families: [{ id: 'family-1', name: 'Famiglia <Test>', role: 'admin', privateData: null, accounts: [], sharedRecords: [] }],
}

describe('account data export', () => {
  it('keeps the complete structure in JSON', () => expect(JSON.parse(serializeAccountExport(data, 'json'))).toEqual(data))
  it('escapes XML content', () => {
    const xml = serializeAccountExport(data, 'xml')
    expect(xml).toContain('Simone &amp; Anna')
    expect(xml).toContain('Famiglia &lt;Test&gt;')
    expect(xml).toContain('<sKeyExport>')
  })
  it('produces normalized CSV rows', () => {
    const csv = serializeAccountExport(data, 'csv')
    expect(csv).toContain('"personale","","movements","movement-1","Casa, luce"')
    expect(csv).toContain('"famiglia","family-1","famiglia","family-1","Famiglia <Test>"')
  })
})
