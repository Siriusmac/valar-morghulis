const LEGACY_HOSTS = new Set(['valarmorghulis.it', 'www.valarmorghulis.it'])
const CANONICAL_ORIGIN = 'https://www.skeyapp.com'

export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (!LEGACY_HOSTS.has(url.hostname.toLowerCase())) return context.next()

  return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 308)
}
