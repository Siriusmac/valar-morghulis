import type { SupabaseClient } from '@supabase/supabase-js'

export interface SecurityFactor { id: string; name: string }
export interface PasskeyInfo { id: string; name: string }
export interface AuthSecurityApi {
  enrollmentEnabled: boolean
  passkeysEnabled: boolean
  status: () => Promise<{ currentLevel: string; needsChallenge: boolean; factors: SecurityFactor[] }>
  enroll: () => Promise<{ id: string; qr: string; secret: string }>
  verify: (factorId: string, code: string) => Promise<void>
  removeFactor: (factorId: string) => Promise<void>
  passkeys: () => Promise<PasskeyInfo[]>
  registerPasskey: () => Promise<void>
  removePasskey: (id: string) => Promise<void>
}

export const mfaEnrollmentEnabled = import.meta.env.VITE_MFA_ENABLED === 'true'
export const passkeysEnabled = import.meta.env.VITE_PASSKEYS_ENABLED === 'true'

export function createAuthSecurityApi(client: SupabaseClient): AuthSecurityApi {
  return {
    enrollmentEnabled: mfaEnrollmentEnabled,
    passkeysEnabled,
    async status() {
      const [assurance, factors] = await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(), client.auth.mfa.listFactors(),
      ])
      if (assurance.error || factors.error) throw new Error('Non è stato possibile verificare la sicurezza della sessione. Riprova.')
      if (!['aal1', 'aal2'].includes(assurance.data.currentLevel ?? '')) throw new Error('Sessione non valida. Accedi nuovamente.')
      const verified = factors.data.all.filter((factor) => factor.status === 'verified')
      return { currentLevel: assurance.data.currentLevel!,
        needsChallenge: (verified.length > 0 || assurance.data.nextLevel === 'aal2') && assurance.data.currentLevel !== 'aal2',
        factors: factors.data.totp.filter((factor) => factor.status === 'verified').map((factor) => ({ id: factor.id, name: factor.friendly_name || 'Autenticatore' })) }
    },
    async enroll() {
      if (!mfaEnrollmentEnabled) throw new Error('Configurazione dell’autenticatore non ancora disponibile.')
      const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Autenticatore sKey ${crypto.randomUUID().slice(0, 6)}`, issuer: 'sKey' })
      if (result.error) throw new Error('Impossibile iniziare la configurazione. Riprova o elimina una configurazione incompleta dalle impostazioni del servizio.')
      return { id: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret }
    },
    async verify(factorId, code) {
      if (!/^\d{6}$/.test(code)) throw new Error('Inserisci il codice a 6 cifre dell’autenticatore.')
      const result = await client.auth.mfa.challengeAndVerify({ factorId, code })
      if (result.error) throw new Error('Codice non valido o scaduto. Usa il codice attuale dell’autenticatore e riprova.')
    },
    async removeFactor(factorId) {
      const result = await client.auth.mfa.unenroll({ factorId })
      if (result.error) throw new Error('Impossibile rimuovere l’autenticatore. Verifica il codice e riprova.')
    },
    async passkeys() {
      if (!passkeysEnabled) return []
      const result = await client.auth.passkey.list()
      if (result.error) throw new Error('Impossibile leggere le passkey. Riprova.')
      return result.data.map((item) => ({ id: item.id, name: item.friendly_name || 'Passkey' }))
    },
    async registerPasskey() {
      if (!passkeysEnabled) throw new Error('Passkey non ancora disponibili.')
      const result = await client.auth.registerPasskey()
      if (result.error) throw new Error('Passkey non creata. La procedura potrebbe essere stata annullata o non essere supportata dal dispositivo.')
    },
    async removePasskey(id) {
      const result = await client.auth.passkey.delete({ passkeyId: id })
      if (result.error) throw new Error('Impossibile eliminare la passkey. Riprova.')
    },
  }
}
