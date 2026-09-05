import { readdir, readFile, stat } from 'node:fs/promises'

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

const oversizedScripts = (await Promise.all(scriptNames.map(async (name) => ({
  name,
  size: (await stat(new URL(name, assetsDirectory))).size,
})))).filter(({ size }) => size > 500_000)

if (oversizedScripts.length) {
  throw new Error(`Build cloud non valida: chunk JavaScript oltre 500 kB (${oversizedScripts.map(({ name }) => name).join(', ')}).`)
}

console.log('Build cloud verificata: autenticazione Supabase inclusa e chunk JavaScript entro 500 kB.')
