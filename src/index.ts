import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import { parseAnalysis } from './analysis'
import { askJev, JevError } from './jev'

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> }
export type Bindings = {
  JEV_API_KEY?: string
  RATE_LIMITER?: RateLimiter
}
type Env = { Bindings: Bindings; Variables: { apiKey: string; rateLimiter: RateLimiter } }

const app = new Hono<Env>()

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
  onError: (c) => c.json({ error: '入力が大きすぎます。3,000文字以内で入力してください。' }, 413),
})

// 他のサイトのページから、利用者のブラウザ経由で API を呼ばせない。
const sameOrigin = createMiddleware<Env>(async (c, next) => {
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) {
    return c.json({ error: 'このサイトの入力欄から送信してください。' }, 403)
  }
  await next()
})

const requireJson = createMiddleware<Env>(async (c, next) => {
  const mediaType = c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return c.json({ error: 'JSON形式で送信してください。' }, 415)
  }
  await next()
})

// ブラウザ側でも同じ文字数を確かめているが、API を直接呼ばれた場合に備えてここでも確かめる。
// 壊れた JSON は validator が HTTPException(400) を投げ、app.onError で 400 として返す。
const analyzeInput = validator('json', (body, c) => {
  const text = body && typeof body === 'object' && typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 10 || text.length > 3000) {
    return c.json({ error: '10〜3,000文字で入力してください。' }, 400)
  }
  return { text }
})

const requireConfig = createMiddleware<Env>(async (c, next) => {
  const apiKey = c.env?.JEV_API_KEY
  const rateLimiter = c.env?.RATE_LIMITER
  if (!apiKey || !rateLimiter) {
    return c.json({ error: '判定サービスの設定が完了していません。' }, 503)
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
    return c.json({ error: '判定サービスに接続できません。時間をおいてお試しください。' }, 503)
  }
  if (!allowed) {
    c.header('Retry-After', '60')
    return c.json({ error: '利用が集中しています。1分ほど待ってから、もう一度お試しください。' }, 429)
  }
  await next()
})

// ---- ルート ----

app.post('/api/analyze', limitBody, sameOrigin, requireJson, analyzeInput, requireConfig, rateLimit, async (c) => {
  const { text } = c.req.valid('json')
  let response: unknown
  try {
    response = await askJev(c.get('apiKey'), text)
  } catch (error) {
    if (error instanceof JevError) return c.json({ error: error.message }, error.status)
    throw error
  }
  try {
    return c.json(parseAnalysis(response))
  } catch (error) {
    console.error('[jev] response validation failed', { name: error instanceof Error ? error.name : typeof error })
    return c.json({ error: '判定結果を読み取れませんでした。時間をおいてもう一度お試しください。' }, 502)
  }
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.notFound((c) => c.json({ error: 'ページが見つかりません。' }, 404))
app.onError((error, c) => {
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: '入力を読み取れませんでした。' }, 400)
  }
  return c.json({ error: '処理に失敗しました。時間をおいてお試しください。' }, 500)
})

export default app
