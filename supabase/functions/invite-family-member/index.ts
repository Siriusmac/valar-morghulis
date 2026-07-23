import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('APP_URL')!
  const authorization = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'authentication_required' }, 401)

  const body = await request.json().catch(() => ({})) as { familyId?: string; email?: string }
  const email = body.email?.trim().toLowerCase()
  if (!body.familyId || !email || !email.includes('@')) return json({ error: 'invalid_request' }, 400)

  const { data: membership } = await userClient
    .from('family_members')
    .select('role')
    .eq('family_id', body.familyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') return json({ error: 'admin_required' }, 403)

  const { data: invitation, error: invitationError } = await userClient
    .from('family_invitations')
    .insert({ family_id: body.familyId, email, invited_by: user.id })
    .select('id, token, expires_at')
    .single()
  if (invitationError) {
    const duplicate = invitationError.code === '23505'
    return json({ error: duplicate ? 'invitation_already_pending' : invitationError.message }, duplicate ? 409 : 400)
  }

  const redirectTo = `${appUrl.replace(/\/$/, '')}/?invite=${invitation.token}&setup=password`
  const { error: mailError } = await adminClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  })
  if (mailError) {
    await adminClient.from('family_invitations').delete().eq('id', invitation.id)
    return json({ error: 'email_delivery_failed' }, 502)
  }

  return json({ invitation, redirectTo })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
