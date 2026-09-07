export type InactivityNotice = { notice_id: string; recipient: string; review_after: string }

export function inactivityMail(reviewAfter: string) {
  const date = new Date(reviewAfter)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_notice_date')
  const deadline = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(date)
  const subject = 'sKey: torna nel tuo account per mantenerlo attivo'
  const text = `Non rileviamo un accesso recente al tuo account sKey.\n\nApri https://www.skeyapp.com e accedi entro il ${deadline} (ora italiana) per annullare il preavviso di cancellazione. Non occorre registrare un movimento. Se hai già ripreso a utilizzare l’app, questo avviso non richiede altre azioni.\n\nDopo questa data l’account potrà essere valutato per la cancellazione, previa verifica amministrativa. Puoi esportare i tuoi dati da Account e famiglie prima della scadenza.\n\nNon rispondere inviando password, codici o dati contabili. Nessun dato finanziario è contenuto in questa email.`
  const html = `<!doctype html><html lang="it"><body style="margin:0;background:#faf9f6;font-family:Arial,sans-serif;color:#15283b"><table role="presentation" width="100%" cellpadding="24"><tr><td align="center"><table role="presentation" width="100%" style="max-width:560px;background:white" cellpadding="24"><tr><td style="background:#c64e2f;color:white;font-size:32px;font-weight:bold">sKey</td></tr><tr><td><h1 style="font-size:24px">Mantieni attivo il tuo account</h1><p>Non rileviamo un accesso recente al tuo account.</p><p>Accedi entro il <strong>${deadline} (ora italiana)</strong> per annullare il preavviso di cancellazione. Basta aprire l’app con una sessione valida: non occorre registrare movimenti.</p><p><a href="https://www.skeyapp.com/" style="display:inline-block;background:#c64e2f;color:white;padding:14px 24px;text-decoration:none;border-radius:8px">Apri sKey</a></p><p>Se hai già ripreso a utilizzare l’app, questo avviso non richiede altre azioni.</p><p>Dopo la scadenza l’account potrà essere valutato per la cancellazione, previa verifica amministrativa. Puoi esportare i tuoi dati da “Account e famiglie”.</p><p style="font-size:13px;color:#667085">Non inviare password, codici o dati contabili in risposta. Questa email non contiene dati finanziari.</p></td></tr></table></td></tr></table></body></html>`
  return { subject, text, html }
}

export interface NoticeStore {
  prepare(): Promise<void>
  claim(): Promise<InactivityNotice | undefined>
  finish(id: string, accepted: boolean): Promise<void>
}

/** One attempt per notice. Uncertain deliveries require operator review, never blind resend. */
export async function deliverInactivityNotices(store: NoticeStore, send: (notice: InactivityNotice) => Promise<void>) {
  await store.prepare()
  let accepted = 0
  let uncertain = 0
  for (let index = 0; index < 20; index++) {
    const notice = await store.claim()
    if (!notice) break
    let delivered = false
    try {
      await send(notice)
      delivered = true
      accepted++
    } catch {
      uncertain++
    }
    // If this fails, the durable 'sending' marker prevents a duplicate attempt.
    await store.finish(notice.notice_id, delivered)
    if (!delivered) break
  }
  return { accepted, uncertain }
}
