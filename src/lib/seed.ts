import type { Account, AppData, User, UserId } from '../types'

export const users: User[] = [
  { id: 'simone', name: 'Simone', email: 'simone@skeyapp.demo', initials: 'SM' },
  { id: 'anna', name: 'Anna', email: 'anna@skeyapp.demo', initials: 'AN' },
]

export const defaultData: AppData = {
  version: 3,
  defaultMovementAccountIds: {},
  accounts: [
    { id: 'simone-bank', ownerId: 'simone', name: 'Conto corrente', institution: 'Intesa Sanpaolo', type: 'bank', scope: 'personal', openingBalance: 2450 },
    { id: 'simone-card', ownerId: 'simone', name: 'Carta di credito', institution: 'Visa •••• 1234', type: 'credit', scope: 'personal', openingBalance: 0 },
    { id: 'simone-cash', ownerId: 'simone', name: 'Contanti', institution: 'Portafoglio', type: 'cash', scope: 'personal', openingBalance: 180 },
    { id: 'simone-paypal', ownerId: 'simone', name: 'PayPal', institution: 'Conto PayPal personale', type: 'paypal', scope: 'personal', openingBalance: 0 },
    { id: 'anna-bank', ownerId: 'anna', name: 'Conto corrente', institution: 'Banca personale', type: 'bank', scope: 'personal', openingBalance: 2160 },
    { id: 'anna-cash', ownerId: 'anna', name: 'Contanti', institution: 'Portafoglio', type: 'cash', scope: 'personal', openingBalance: 90 },
    { id: 'anna-paypal', ownerId: 'anna', name: 'PayPal', institution: 'Conto PayPal personale', type: 'paypal', scope: 'personal', openingBalance: 0 },
    { id: 'family-bank', name: 'Conto di famiglia', institution: 'Cointestato', type: 'bank', scope: 'family', openingBalance: 3200 },
  ],
  categories: [
    { id: 'luce', name: 'Luce', scope: 'family', movementType: 'expense', color: '#d99945' },
    { id: 'condominio', name: 'Spese condominiali', scope: 'family', movementType: 'expense', color: '#617c69' },
    { id: 'mutuo', name: 'Mutuo', scope: 'family', movementType: 'expense', color: '#33475b' },
    { id: 'assicurazione', name: 'Assicurazione', scope: 'family', movementType: 'expense', color: '#7b6b8d' },
    { id: 'rifiuti', name: 'Rifiuti', scope: 'family', movementType: 'expense', color: '#6f8563' },
    { id: 'alimentari', name: 'Alimentari', scope: 'family', movementType: 'expense', color: '#c64e2f' },
    { id: 'caffe', name: 'Caffè', scope: 'family', movementType: 'expense', color: '#986a4e' },
    { id: 'accessori-casa', name: 'Accessori casa', scope: 'family', movementType: 'expense', color: '#c17a69' },
    { id: 'tasse-scolastiche', name: 'Tasse scolastiche', scope: 'family', movementType: 'expense', color: '#607c9a' },
    { id: 'ristorante', name: 'Ristorante', scope: 'family', movementType: 'expense', color: '#df826d' },
    { id: 'trasporti', name: 'Trasporti', scope: 'family', movementType: 'expense', color: '#768da2' },
    { id: 'stipendio', name: 'Stipendio', scope: 'family', movementType: 'income', color: '#3f7650' },
    { id: 'assegni-previdenziali', name: 'Assegni previdenziali', scope: 'family', movementType: 'income', color: '#72977b' },
    { id: 'rimborso-entrata', name: 'Rimborsi', scope: 'family', movementType: 'income', color: '#9ab49b' },
    { id: 'altre-entrate', name: 'Altre entrate', scope: 'family', movementType: 'income', color: '#b9c9b7' },
  ],
  beneficiaries: [
    { id: 'lidl', name: 'Lidl', scope: 'family' },
    { id: 'eurospar', name: 'Eurospar', scope: 'family' },
    { id: 'octopus-energy', name: 'Octopus Energy', scope: 'family' },
    { id: 'hotel-paris', name: 'Hôtel Paris Centre', scope: 'family' },
    { id: 'amazon', name: 'Amazon', scope: 'family' },
  ],
  senders: [
    { id: 'datore-lavoro', name: 'Datore di lavoro', scope: 'family' },
    { id: 'inps', name: 'INPS', scope: 'family' },
  ],
  tags: [
    { id: 'vacanza-parigi', name: 'Vacanza a Parigi', scope: 'family', color: '#c64e2f' },
    { id: 'casa-2026', name: 'Casa 2026', scope: 'family', color: '#617c69' },
  ],
  tagReportIds: ['vacanza-parigi', 'casa-2026'],
  movements: [
    { id: 'seed-1', type: 'expense', authorId: 'simone', memberId: 'simone', amount: 30, date: '2026-07-16', description: 'Spesa settimanale', categoryId: 'alimentari', beneficiaryId: 'lidl', accountId: 'simone-bank', shared: true, createdAt: '2026-07-16T18:30:00.000Z' },
    { id: 'seed-2', type: 'expense', authorId: 'anna', memberId: 'anna', amount: 50, date: '2026-07-17', description: 'Spesa per casa', categoryId: 'alimentari', beneficiaryId: 'eurospar', accountId: 'anna-bank', shared: true, createdAt: '2026-07-17T17:00:00.000Z' },
    { id: 'seed-3', type: 'expense', authorId: 'simone', memberId: 'simone', amount: 72, date: '2026-07-15', description: 'Bolletta elettrica', categoryId: 'luce', beneficiaryId: 'octopus-energy', accountId: 'family-bank', shared: true, tagId: 'casa-2026', createdAt: '2026-07-15T08:00:00.000Z' },
    { id: 'seed-4', type: 'income', authorId: 'simone', memberId: 'simone', amount: 1200, date: '2026-07-01', description: 'Stipendio luglio', categoryId: 'stipendio', beneficiaryId: 'beneficiary-user-simone', senderId: 'datore-lavoro', accountId: 'simone-bank', shared: false, createdAt: '2026-07-01T07:00:00.000Z' },
    { id: 'seed-5', type: 'expense', authorId: 'simone', memberId: 'simone', amount: 180, date: '2026-07-08', description: 'Hotel Parigi', categoryId: 'accessori-casa', beneficiaryId: 'hotel-paris', accountId: 'simone-card', shared: false, tagId: 'vacanza-parigi', createdAt: '2026-07-08T10:00:00.000Z' },
    { id: 'seed-6', type: 'expense', authorId: 'anna', memberId: 'anna', amount: 64, date: '2026-07-09', description: 'Cena a Parigi', categoryId: 'ristorante', beneficiaryId: 'hotel-paris', accountId: 'anna-bank', shared: true, tagId: 'vacanza-parigi', createdAt: '2026-07-09T20:00:00.000Z' },
    { id: 'seed-7', type: 'income', authorId: 'anna', memberId: 'anna', amount: 400, date: '2026-07-05', description: 'Assegno familiare', categoryId: 'assegni-previdenziali', beneficiaryId: 'beneficiary-user-anna', senderId: 'inps', accountId: 'family-bank', shared: true, createdAt: '2026-07-05T09:00:00.000Z' },
    { id: 'seed-installment-1', type: 'expense', authorId: 'simone', memberId: 'simone', amount: 40, date: '2026-07-12', description: 'Accessori casa · rata 1/3', categoryId: 'accessori-casa', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, installmentPlanId: 'seed-plan', installmentProvider: 'Amazon', installmentNumber: 1, installmentCount: 3, createdAt: '2026-07-12T10:00:00.000Z' },
  ],
  scheduledPayments: [
    { id: 'seed-payment-2', planId: 'seed-plan', authorId: 'simone', memberId: 'simone', amount: 40, dueDate: '2026-08-12', description: 'Accessori casa', categoryId: 'accessori-casa', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, provider: 'Amazon', installmentNumber: 2, installmentCount: 3, status: 'scheduled' },
    { id: 'seed-payment-3', planId: 'seed-plan', authorId: 'simone', memberId: 'simone', amount: 40, dueDate: '2026-09-12', description: 'Accessori casa', categoryId: 'accessori-casa', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, provider: 'Amazon', installmentNumber: 3, installmentCount: 3, status: 'scheduled' },
  ],
  transfers: [],
  reimbursements: [],
  loans: [],
  loanRepayments: [],
}

export function createStarterData(userId: UserId, sharedAccounts: Account[]): AppData {
  return {
    version: 3,
    defaultMovementAccountIds: {},
    accounts: [
      ...sharedAccounts,
      { id: `${userId}-cash`, ownerId: userId, name: 'Contanti', institution: 'Portafoglio', type: 'cash', scope: 'personal', openingBalance: 0 },
    ],
    categories: defaultData.categories.filter((item) => item.scope === 'family').map((item) => ({ ...item })),
    beneficiaries: [],
    senders: [],
    tags: [],
    tagReportIds: [],
    movements: [],
    scheduledPayments: [],
    transfers: [],
    reimbursements: [],
    loans: [],
    loanRepayments: [],
  }
}

export function createPersonalStarterData(userId: UserId): AppData {
  return {
    version: 3,
    defaultMovementAccountIds: {},
    accounts: [{ id: `${userId}-cash`, ownerId: userId, name: 'Contanti', institution: 'Portafoglio', type: 'cash', scope: 'personal', openingBalance: 0 }],
    categories: defaultData.categories.map((item) => ({ ...item, scope: 'personal', ownerId: userId })),
    beneficiaries: [],
    senders: [],
    tags: [],
    tagReportIds: [],
    movements: [],
    scheduledPayments: [],
    transfers: [],
    reimbursements: [],
    loans: [],
    loanRepayments: [],
  }
}
