import {SignJWT, jwtVerify} from 'jose'

export const SESSION_COOKIE = 'fabricut_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export type SessionRole = 'admin' | 'customer'
export interface Session {
  sub: string
  email: string
  role: SessionRole
  name?: string
}

export function sessionSecretBytes(secret?: string): Uint8Array {
  const value = secret ?? process.env.SESSION_SECRET ?? ''
  if (value.length < 16) throw new Error('SESSION_SECRET is not configured')
  return new TextEncoder().encode(value)
}

export async function signSession(session: Session, secret?: string): Promise<string> {
  return new SignJWT({
    email: session.email,
    role: session.role,
    typ: 'sess',
    ...(session.name ? {name: session.name} : {}),
  })
    .setProtectedHeader({alg: 'HS256'})
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecretBytes(secret))
}

export async function verifySession(token: string, secret?: string): Promise<Session | null> {
  try {
    const {payload} = await jwtVerify(token, sessionSecretBytes(secret), {algorithms: ['HS256']})
    if (payload.typ !== 'sess') return null
    if (payload.role !== 'admin' && payload.role !== 'customer') return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    const email = typeof payload.email === 'string' ? payload.email : ''
    const name = typeof payload.name === 'string' ? payload.name : undefined
    return {sub: payload.sub, email, role: payload.role, name}
  } catch {
    return null
  }
}

export function readCookie(header: string | null, name = SESSION_COOKIE): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function cookieHeader(token: string, secure: boolean): string {
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE}`,
  ]
  if (secure) flags.push('Secure')
  return flags.join('; ')
}

export function clearCookieHeader(secure: boolean): string {
  const flags = [`${SESSION_COOKIE}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0']
  if (secure) flags.push('Secure')
  return flags.join('; ')
}
