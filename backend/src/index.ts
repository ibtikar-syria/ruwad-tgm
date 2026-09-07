import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  loginHandler,
  logoutHandler,
  meHandler,
  requireAdmin,
} from './auth'
import { apiRoutes } from './routes/api'
import { telegramWebhookHandler } from './telegram/webhook'
import type { AppVariables, CloudflareBindings } from './types'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/', (c) => c.json({ name: 'telegram-group-manager', ok: true }))

app.post('/telegram/webhook', telegramWebhookHandler)

app.post('/api/auth/login', loginHandler)
app.post('/api/auth/logout', logoutHandler)
app.get('/api/auth/me', meHandler)

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) {
    return next()
  }
  return requireAdmin(c, next)
})

app.route('/api', apiRoutes)

export default app
