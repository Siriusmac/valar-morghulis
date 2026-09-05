import type { AppData, User } from '../types'

export type ExportFormat = 'json' | 'xml' | 'csv'
export interface AccountExportData {
  exportedAt: string
  profile: User
  personalData: Partial<AppData> | null
  families: Array<{
    id: string
    name: string
    role: 'admin' | 'member'
    privateData: Partial<AppData> | null
    accounts: unknown[]
    sharedRecords: Array<{ recordType: string; recordId: string; data: unknown }>
  }>
}

export function serializeAccountExport(data: AccountExportData, format: ExportFormat) {
  if (format === 'json') return JSON.stringify(data, null, 2)
  if (format === 'xml') return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml('sKeyExport', data)}`
  return toCsv(data)
}

export function downloadAccountExport(data: AccountExportData, format: ExportFormat) {
  const content = serializeAccountExport(data, format)
  const mime = format === 'json' ? 'application/json' : format === 'xml' ? 'application/xml' : 'text/csv'
  const blob = new Blob([format === 'csv' ? `\uFEFF${content}` : content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `skey-${new Date().toISOString().slice(0, 10)}.${format}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function toXml(name: string, value: unknown): string {
  if (Array.isArray(value)) return `<${name}>${value.map((item) => toXml('elemento', item)).join('')}</${name}>`
  if (value && typeof value === 'object') {
    return `<${name}>${Object.entries(value).map(([key, item]) => toXml(xmlName(key), item)).join('')}</${name}>`
  }
  if (value === null || value === undefined) return `<${name}/>`
  return `<${name}>${escapeXml(String(value))}</${name}>`
}

function xmlName(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return /^[a-zA-Z_]/.test(safe) ? safe : `campo_${safe}`
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function toCsv(data: AccountExportData) {
  const rows: Array<Array<string>> = [
    ['sezione', 'famiglia_id', 'tipo', 'id', 'nome', 'data'],
    ['profilo', '', 'utente', data.profile.id, data.profile.name, JSON.stringify(data.profile)],
    ['metadati', '', 'esportazione', '', '', data.exportedAt],
  ]
  for (const [key, values] of Object.entries(data.personalData ?? {})) {
    if (Array.isArray(values)) {
      for (const value of values) {
        const record = value && typeof value === 'object' ? value as unknown as Record<string, unknown> : {}
        rows.push(['personale', '', key, String(record.id ?? ''), String(record.name ?? record.description ?? ''), JSON.stringify(value)])
      }
    } else rows.push(['personale', '', key, '', '', JSON.stringify(values)])
  }
  for (const family of data.families) {
    rows.push(['famiglia', family.id, 'famiglia', family.id, family.name, JSON.stringify({ role: family.role })])
    rows.push(['famiglia', family.id, 'dati_privati_famiglia', '', '', JSON.stringify(family.privateData)])
    for (const account of family.accounts) {
      const record = account as Record<string, unknown>
      rows.push(['famiglia', family.id, 'conto', String(record.id ?? ''), String(record.name ?? ''), JSON.stringify(account)])
    }
    for (const record of family.sharedRecords) {
      const details = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {}
      rows.push(['famiglia', family.id, record.recordType, record.recordId, String(details.name ?? details.description ?? ''), JSON.stringify(record.data)])
    }
  }
  return rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n')
}
