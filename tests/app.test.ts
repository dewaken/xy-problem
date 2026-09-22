import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app, { type Bindings } from '../src/index'

const sample = 'ファイル形式を判定したいので、ファイル名の末尾3文字を取得する方法を教えてください。'
function fixture() {
  return {
    model: 'jev-1.13.0',
    answers: {
      verdict: { type: 'choice', choice: 'suspected', confidence: 0.85, probabilities: { suspected: 0.9, unlikely: 0.02, insufficient: 0.08 } },
      goal_missing: { type: 'noul', noul: 0.1 },
      solution_fixation: { type: 'noul', noul: 0.95 },
      untested_assumption: { type: 'noul', noul: 0.9 },
    },
    usage: { input_tokens: 500, output_tokens: 80 },
  }
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
function env(): Bindings {
  return { JEV_API_KEY: 'test-api-key', RATE_LIMITER: { limit: async () => ({ success: true }) } }
}
function mockFetch(result: unknown = fixture(), status = 200) {
  const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => response(result, status))
  vi.stubGlobal('fetch', request)
  return request
}
function post(body: unknown, bindings = env(), headers: Record<string, string> = {}) {
  return app.request('http://localhost/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }, bindings)
}
beforeEach(() => { mockFetch() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('analysis API', () => {
  it('sends the official TypeSafe request and converts its answer for display', async () => {
    const fetchRequest = mockFetch()
    const response = await post({ text: `  ${sample}  ` })
    expect(response.status).toBe(200)
    const [url, options] = fetchRequest.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-api-key')
    const requestBody = JSON.parse(String(options?.body))
    expect(requestBody.model).toBe('jev-latest')
    expect(requestBody.state).toBe(sample)
    expect(requestBody.questions.verdict.type).toBe('choice')
    const result = await response.json() as any
    expect(result.verdict).toBe('suspected')
    expect(result.confidence).toBe(85)
    expect(result.signals.map((s: any) => s.value)).toEqual([10, 95, 90])
    expect(result.questions.length).toBeGreaterThan(0)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })
  it.each([null, {}, { text: 2 }, { text: '短い' }, { text: ' '.repeat(20) }, { text: 'a'.repeat(3001) }])('rejects invalid input %j before calling Jev', async (body) => {
    const fetchRequest = mockFetch()
    expect((await post(body)).status).toBe(400)
    expect(fetchRequest).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON', async () => {
    const result = await app.request('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, env())
    expect(result.status).toBe(400)
  })
  it('rejects oversized bodies', async () => {
    expect((await post({ text: 'a'.repeat(17000) })).status).toBe(413)
  })
  it('blocks another browser origin', async () => {
    expect((await post({ text: sample }, env(), { Origin: 'https://other.example' })).status).toBe(403)
  })
  it('returns 429 when rate limited', async () => {
    const bindings = env()
    bindings.RATE_LIMITER!.limit = async () => ({ success: false })
    const result = await post({ text: sample }, bindings)
    expect(result.status).toBe(429)
    expect(result.headers.get('Retry-After')).toBe('60')
  })
  it('returns 503 without a TypeSafe API key', async () => {
    const bindings = env()
    delete bindings.JEV_API_KEY
    expect((await post({ text: sample }, bindings)).status).toBe(503)
  })
  it.each([{}, { answers: {} }, { ...fixture(), answers: { ...fixture().answers, goal_missing: { type: 'noul', noul: 3 } } }])('rejects malformed provider responses', async (value) => {
    mockFetch(value)
    expect((await post({ text: sample })).status).toBe(502)
  })
  it('reports invalid API credentials without exposing provider details', async () => {
    mockFetch({ detail: 'secret-auth-detail' }, 401)
    const result = await post({ text: sample })
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('secret-auth-detail')
  })
  it('does not expose network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret-network-detail') }))
    const result = await post({ text: sample })
    expect(result.status).toBe(502)
    expect(await result.text()).not.toContain('secret-network-detail')
  })
  it('responds with a timeout instead of hanging', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const pending = post({ text: sample })
    await vi.advanceTimersByTimeAsync(21000)
    expect((await pending).status).toBe(504)
  })
  it.each(['unlikely', 'insufficient'])('preserves the %s verdict', async (verdict) => {
    const value = fixture()
    value.answers.verdict.choice = verdict
    mockFetch(value)
    const result = await post({ text: sample })
    expect((await result.json() as any).verdict).toBe(verdict)
  })
})
