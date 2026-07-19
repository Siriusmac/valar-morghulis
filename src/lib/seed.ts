import type { AppData, User } from '../types'

export const users: User[] = [
  { id: 'simone', name: 'Simone', email: 'simone@valarmorghulis.demo', initials: 'SM' },
  { id: 'anna', name: 'Anna', email: 'anna@valarmorghulis.demo', initials: 'AN' },
]

export const defaultData: AppData = {
  version: 1,
  accounts: [
    { id: 'simone-bank', ownerId: 'simone', name: 'Conto corrente', institution: 'Intesa Sanpaolo', type: 'bank', openingBalance: 1250 },
    { id: 'simone-card', ownerId: 'simone', name: 'Carta di credito', institution: 'Visa •••• 1234', type: 'credit', openingBalance: -320 },
    { id: 'anna-bank', ownerId: 'anna', name: 'Conto corrente', institution: 'Banca personale', type: 'bank', openingBalance: 1560 },
  ],
  categories: [
    { id: 'luce', name: 'Luce', scope: 'family', color: '#d99945' },
    { id: 'condominio', name: 'Spese condominiali', scope: 'family', color: '#617c69' },
    { id: 'mutuo', name: 'Mutuo', scope: 'family', color: '#33475b' },
    { id: 'assicurazione', name: 'Assicurazione', scope: 'family', color: '#7b6b8d' },
    { id: 'rifiuti', name: 'Rifiuti', scope: 'family', color: '#6f8563' },
    { id: 'alimentari', name: 'Alimentari', scope: 'family', color: '#c64e2f' },
    { id: 'caffe', name: 'Caffè', scope: 'family', color: '#986a4e' },
    { id: 'accessori-casa', name: 'Accessori casa', scope: 'family', color: '#c17a69' },
    { id: 'tasse-scolastiche', name: 'Tasse scolastiche', scope: 'family', color: '#607c9a' },
  ],
  beneficiaries: [
    { id: 'lidl', name: 'Lidl', scope: 'family' },
    { id: 'eurospar', name: 'Eurospar', scope: 'family' },
    { id: 'octopus-energy', name: 'Octopus Energy', scope: 'family' },
  ],
  expenses: [
    {
      id: 'seed-1', authorId: 'simone', payerId: 'simone', amount: 30, date: '2026-07-16',
      description: 'Spesa settimanale', categoryId: 'alimentari', beneficiaryId: 'lidl',
      accountId: 'simone-bank', shared: true, createdAt: '2026-07-16T18:30:00.000Z',
    },
    {
      id: 'seed-2', authorId: 'anna', payerId: 'anna', amount: 50, date: '2026-07-17',
      description: 'Spesa per casa', categoryId: 'alimentari', beneficiaryId: 'eurospar',
      accountId: 'anna-bank', shared: true, createdAt: '2026-07-17T17:00:00.000Z',
    },
  ],
  reimbursements: [],
}
