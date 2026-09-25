import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { check } from './check'
import { discord } from './discord'
import { localeFromQuery, messages } from './i18n'

export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> }
export type Bindings = {
  JEV_API_KEY?: string
  RATE_LIMITER?: RateLimiter
  // Discord アプリの Public Key（16進）。Interactions Endpoint の署名検証に使う。
  DISCORD_PUBLIC_KEY?: string
  // Discord から使ってよいユーザー ID（カンマ区切り）。未設定なら誰も使えない。
  DISCORD_ALLOWED_USER_IDS?: string
}
type Env = { Bindings: Bindings; Variables: { apiKey: string; rateLimiter: RateLimiter } }

const app = new Hono<Env>()

// 利用者向けの文言の言語。画面は英語表示のときに ?lang=en を付けて呼ぶ。指定がなければ日本語。
const localeOf = (c: Context) => localeFromQuery(c.req.query('lang'))
const errorsOf = (c: Context) => messages(localeOf(c)).errors

// 判定結果は入力ごとに異なり、保存もしないため、API の応答はキャッシュさせない。
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})

// ---- POST /api/analyze の前段チェック（上から順に実行され、失敗したらそこで応答を返す） ----

// 3,000文字の日本語（UTF-8で約9KB）に余裕を持たせた上限。
const limitBody = bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) => c.json({ error: errorsOf(c).tooLarge }, 413),
})

// 他のサイトのページから、利用者のブラウザ経由で API を呼ばせない。
const sameOrigin = createMiddleware<Env>(async (c, next) => {
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) {
    return c.json({ error: errorsOf(c).crossOrigin }, 403)
  }
  await next()
})

const requireJson = createMiddleware<Env>(async (c, next) => {
  const mediaType = c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return c.json({ error: errorsOf(c).notJson }, 415)
  }
  await next()
})

// ブラウザ側でも同じ文字数を確かめているが、API を直接呼ばれた場合に備えてここでも確かめる。
// 壊れた JSON は validator が HTTPException(400) を投げ、app.onError で 400 として返す。
const analyzeInput = validator('json', (body, c) => {
  const text = body && typeof body === 'object' && typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 10 || text.length > 3000) {
    return c.json({ error: errorsOf(c).length }, 400)
  }
  return { text }
})

const requireConfig = createMiddleware<Env>(async (c, next) => {
  const apiKey = c.env?.JEV_API_KEY
  const rateLimiter = c.env?.RATE_LIMITER
  if (!apiKey || !rateLimiter) {
    return c.json({ error: errorsOf(c).notConfigured }, 503)
  }
  c.set('apiKey', apiKey)
  c.set('rateLimiter', rateLimiter)
  await next()
})

// IP ごとに 10回/分（wrangler.jsonc の RATE_LIMITER）。Jev の利用料を守るための緩い制限。
const rateLimit = createMiddleware<Env>(async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'local'
  let allowed: boolean
  try {
    allowed = (await c.get('rateLimiter').limit({ key: `xy-analyze:${ip}` })).success
  } catch {
    return c.json({ error: errorsOf(c).rateLimiterDown }, 503)
  }
  if (!allowed) {
    c.header('Retry-After', '60')
    return c.json({ error: errorsOf(c).busy }, 429)
  }
  await next()
})

// ---- ルート ----

app.post('/api/analyze', limitBody, sameOrigin, requireJson, analyzeInput, requireConfig, rateLimit, async (c) => {
  const { text } = c.req.valid('json')
  const result = await check(c.get('apiKey'), text, localeOf(c))
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json(result.analysis)
})

app.route('/discord', discord)

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.notFound((c) => c.json({ error: errorsOf(c).notFound }, 404))
app.onError((error, c) => {
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: errorsOf(c).badInput }, 400)
  }
  return c.json({ error: errorsOf(c).failed }, 500)
})

export default app
