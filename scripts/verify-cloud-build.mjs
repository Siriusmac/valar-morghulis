import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const projectDirectory = fileURLToPath(new URL('../', import.meta.url))
const environment = loadEnv('production', projectDirectory, '')
const supabaseUrl = environment.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()
const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const assetNames = await readdir(assetsDirectory)
const scriptNames = assetNames.filter((name) => name.endsWith('.js'))
const scripts = await Promise.all(
  scriptNames.map((name) => readFile(new URL(name, assetsDirectory), 'utf8')),
)

if (
  !supabaseUrl
  || !supabaseAnonKey
  || supabaseUrl.includes('YOUR_PROJECT')
  || supabaseAnonKey.includes('YOUR_PUBLISHABLE_ANON_KEY')
) {
  throw new Error(
    'Build cloud non valida: configurazione Supabase assente. Crea .env.production.local con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
  )
}

if (!scripts.some((source) => source.includes(supabaseUrl) && source.includes(supabaseAnonKey))) {
  throw new Error('Build cloud non valida: la configurazione Supabase di produzione non è inclusa nel bundle.')
}

const oversizedScripts = (await Promise.all(scriptNames.map(async (name) => ({
  name,
  size: (await stat(new URL(name, assetsDirectory))).size,
})))).filter(({ size }) => size > 500_000)

if (oversizedScripts.length) {
  throw new Error(`Build cloud non valida: chunk JavaScript oltre 500 kB (${oversizedScripts.map(({ name }) => name).join(', ')}).`)
}

console.log('Build cloud verificata: autenticazione Supabase inclusa e chunk JavaScript entro 500 kB.')
