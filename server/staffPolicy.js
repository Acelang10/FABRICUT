// Authorization policy only. Call ONLY after Firebase verifies the ID token.
// Never authorize decoded/unverified JWT payloads with this function.
export function isApprovedStaff(claims, approvedEmails = [], projectId = 'fabricut-248b4', now = Date.now() / 1000) {
  if (!claims || !Array.isArray(approvedEmails) || approvedEmails.length === 0) return false
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return false
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return false
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now) return false
  if (claims.email_verified !== true || claims.firebase?.sign_in_provider !== 'google.com') return false
  if (typeof claims.email !== 'string') return false
  const approved = new Set(approvedEmails.filter(email => typeof email === 'string').map(email => email.trim().toLowerCase()).filter(Boolean))
  return approved.has(claims.email.toLowerCase())
}

export function readBearerToken(header) {
  if (typeof header !== 'string') return null
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header)
  return match ? match[1] : null
}
