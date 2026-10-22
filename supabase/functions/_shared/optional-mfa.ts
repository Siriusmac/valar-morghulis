// Always pass the client carrying the user's Authorization header, never adminClient.
// Native Auth verification alone only proves the first factor. The database checks
// the live enrollment state and the signed JWT assurance level before side effects.
export async function userPassedOptionalMfa(userClient: {
  rpc: (name: 'require_optional_mfa') => PromiseLike<{ error: unknown }>
}) {
  try {
    const result = await userClient.rpc('require_optional_mfa')
    return !result.error
  } catch { return false }
}
