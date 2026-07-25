import { readdir, readFile } from 'node:fs/promises'

const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const assetNames = await readdir(assetsDirectory)
const scriptNames = assetNames.filter((name) => name.endsWith('.js'))
const scripts = await Promise.all(
  scriptNames.map((name) => readFile(new URL(name, assetsDirectory), 'utf8')),
)

if (!scripts.some((source) => source.includes('.supabase.co'))) {
  throw new Error(
    'Build cloud non valida: configurazione Supabase assente. Crea .env.production.local con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
  )
}

console.log('Build cloud verificata: autenticazione Supabase inclusa.')
