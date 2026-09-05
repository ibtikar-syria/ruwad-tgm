import type { Context, MiddlewareHandler, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { CloudflareBindings, AppVariables } from './types'

const COOKIE_NAME = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function hmacVerify(secret: string, payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, payload)
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

export async function createSessionToken(adminSecret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `admin:${exp}`
  const sig = await hmacSign(adminSecret, payload)
  return `${payload}.${sig}`
}

export async function verifySessionToken(
  adminSecret: string,
  token: string,
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, sig] = parts
  if (!payload || !sig) return false
  if (!(await hmacVerify(adminSecret, payload, sig))) return false
  const [, expStr] = payload.split(':')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  return true
}

export function setSessionCookie(
  c: Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>,
  token: string,
): void {
  const isHttps = new URL(c.req.url).protocol === 'https:'
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie(
  c: Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>,
): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
}

export const requireAdmin: MiddlewareHandler<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}> = async (c, next: Next) => {
  const token = getCookie(c, COOKIE_NAME)
  if (!token || !(await verifySessionToken(c.env.ADMIN_SECRET, token))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('admin', true)
  await next()
}

export async function loginHandler(
  c: Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>,
) {
  let body: { secret?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.secret || body.secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Invalid secret' }, 401)
  }

  const token = await createSessionToken(c.env.ADMIN_SECRET)
  setSessionCookie(c, token)
  return c.json({ ok: true })
}

export async function logoutHandler(
  c: Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>,
) {
  clearSessionCookie(c)
  return c.json({ ok: true })
}

export async function meHandler(
  c: Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>,
) {
  const token = getCookie(c, COOKIE_NAME)
  if (!token || !(await verifySessionToken(c.env.ADMIN_SECRET, token))) {
    return c.json({ authenticated: false }, 401)
  }
  return c.json({ authenticated: true })
}
