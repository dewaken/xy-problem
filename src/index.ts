import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { buildInput, parseAnalysis, type JevInput } from './analysis'

export type Bindings = {
  JEV_API_KEY?: string
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})
app.use('/api/analyze', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: '入力が大きすぎます。3,000文字以内で入力してください。' }, 413) }))
app.post('/api/analyze', async (c) => {
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'このサイトの入力欄から送信してください。' }, 403)
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return c.json({ error: 'JSON形式で送信してください。' }, 415)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '入力を読み取れませんでした。' }, 400) }
  const text = body && typeof body === 'object' && 'text' in body && typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 10 || text.length > 3000) return c.json({ error: '10〜3,000文字で入力してください。' }, 400)
  if (!c.env?.JEV_API_KEY || !c.env.RATE_LIMITER) return c.json({ error: '判定サービスの設定が完了していません。' }, 503)
  try {
    const limit = await c.env.RATE_LIMITER.limit({ key: `xy-analyze:${c.req.header('CF-Connecting-IP') || 'local'}` })
    if (!limit.success) {
      c.header('Retry-After', '60')
      return c.json({ error: '利用が集中しています。1分ほど待ってから、もう一度お試しください。' }, 429)
    }
  } catch { return c.json({ error: '判定サービスに接続できません。時間をおいてお試しください。' }, 503) }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, 20000)
  })
  let response: unknown
  try {
    const upstream = await Promise.race([fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', ...buildInput(text) }),
      signal: controller.signal,
    }), timeout])
    if (!upstream.ok) {
      console.error('[jev] upstream rejected request', { status: upstream.status })
      return c.json({ error: upstream.status === 401 || upstream.status === 403 ? 'Jev APIキーを確認してください。' : 'Jevに接続できませんでした。時間をおいてお試しください。' }, upstream.status === 401 || upstream.status === 403 ? 503 : 502)
    }
    response = await upstream.json()
  } catch (error) {
    if (controller.signal.aborted) return c.json({ error: '応答に時間がかかっています。少し待ってからお試しください。' }, 504)
    const failure = error && typeof error === 'object' ? error as Record<string, unknown> : {}
    const cause = failure.cause && typeof failure.cause === 'object' ? failure.cause as Record<string, unknown> : {}
    const safeMessage = (value: unknown) => typeof value === 'string' ? value.replaceAll(text, '[redacted input]').slice(0, 240) : undefined
    console.error('[jev] request failed', {
      name: error instanceof Error ? error.name : typeof error,
      message: safeMessage(error instanceof Error ? error.message : failure.message),
      causeName: typeof cause.name === 'string' ? cause.name : undefined,
    })
    return c.json({ error: 'Jevによる判定を取得できませんでした。時間をおいてもう一度お試しください。' }, 502)
  } finally { clearTimeout(timer) }
  try {
    return c.json(parseAnalysis(response))
  } catch (error) {
    console.error('[jev] response validation failed', { name: error instanceof Error ? error.name : typeof error })
    return c.json({ error: 'Jevの応答を読み取れませんでした。時間をおいてもう一度お試しください。' }, 502)
  }
})
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.notFound((c) => c.json({ error: 'ページが見つかりません。' }, 404))
app.onError((_, c) => c.json({ error: '処理に失敗しました。時間をおいてお試しください。' }, 500))
export default app
