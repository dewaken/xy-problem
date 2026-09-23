import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app, { type Bindings } from '../src/index'

// 依頼書 #1 の文。下の偽の応答（answers の既定値）は、この文に実際の Jev が返した確率に近い値にしている。
const sample = 'Bot Manager の設定変更はあったか。Cookie サイズが大きいようだが以前からか'
type Probabilities = Record<string, number>
const choice = (probabilities: Probabilities) => ({ type: 'choice', choice: Object.keys(probabilities)[0], confidence: 0.9, probabilities })
function answers(overrides: Partial<Record<'symptom' | 'goal' | 'target' | 'ask', Probabilities>> & { tried?: number } = {}) {
  return {
    symptom: choice(overrides.symptom ?? { stated: 0, vague: 0.85, absent: 0.15 }),
    goal: choice(overrides.goal ?? { stated: 0.01, vague: 0.1, absent: 0.89 }),
    target: choice(overrides.target ?? { named: 1, general: 0, none: 0 }),
    ask: choice(overrides.ask ?? { cause: 0.04, means: 0.96, advice: 0, not_request: 0 }),
    tried: { type: 'noul', noul: overrides.tried ?? 0.27 },
  }
}
function fixture(overrides: Parameters<typeof answers>[0] = {}) {
  return { model: 'jev-1.13.0', answers: answers(overrides), usage: { input_tokens: 500, output_tokens: 80 } }
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
    expect(Object.keys(requestBody.questions)).toEqual(['symptom', 'goal', 'target', 'tried', 'ask'])
    const result = await response.json() as any
    expect(result.verdict).toBe('strong')
    expect(result).not.toHaveProperty('confidence')
    expect(result.missing.map((m: any) => m.label)).toEqual(['実際に起きている問題', '最終的に実現したいこと'])
    expect(result.elements).toEqual([
      expect.objectContaining({ label: '実際に起きている問題', stated: false, probability: 0 }),
      expect.objectContaining({ label: '最終的に実現したいこと', stated: false, probability: 1 }),
      expect.objectContaining({ label: '試したこと・切り分けの結果', stated: false, probability: 27 }),
    ])
    expect(result.questions.length).toBe(3)
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
  it.each([{}, { answers: {} }, { ...fixture(), answers: { ...fixture().answers, tried: { type: 'noul', noul: 3 } } }, { ...fixture(), answers: { ...fixture().answers, goal: { type: 'noul', noul: 0.5 } } }])('rejects malformed provider responses', async (value) => {
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
})

describe('verdict composition', () => {
  async function verdictFor(overrides: Parameters<typeof answers>[0]) {
    mockFetch(fixture(overrides))
    return await (await post({ text: sample })).json() as any
  }
  it('flags a named target without a stated symptom as a strong suspicion (#1)', async () => {
    expect((await verdictFor({})).verdict).toBe('strong')
  })
  it('flags asking for a specific means without a goal', async () => {
    const result = await verdictFor({ target: { named: 0.1, general: 0.8, none: 0.1 } })
    expect(result.verdict).toBe('suspected')
  })
  it('still flags asking for a specific means when the goal is only vague (issue #4)', async () => {
    const result = await verdictFor({ target: { named: 0.1, general: 0.8, none: 0.1 }, goal: { stated: 0.1, vague: 0.7, absent: 0.2 } })
    expect(result.verdict).toBe('suspected')
  })
  it('does not call it unlikely when neither symptom nor goal is stated (#5)', async () => {
    const result = await verdictFor({ target: { named: 0.2, general: 0.8, none: 0 }, ask: { cause: 0, means: 0.05, advice: 0.95, not_request: 0 }, goal: { stated: 0.02, vague: 0.45, absent: 0.53 } })
    expect(result.verdict).toBe('borderline')
  })
  it('shows every element on the same axis: the probability that it is stated', async () => {
    const result = await verdictFor({ goal: { stated: 0.41, vague: 0.15, absent: 0.44 }, tried: 0.85 })
    expect(result.elements.map((e: any) => [e.stated, e.probability])).toEqual([[false, 0], [false, 41], [true, 85]])
  })
  // stated が最大確率の選択肢でも 50% 未満なら「書かれていない」側に揃える。
  // 行の色と「書かれていないこと」の一覧が別の軸で決まると、同じ要素が両方に出る（issue #3）。
  it('keeps each row consistent with the list of what is not written (#3)', async () => {
    const result = await verdictFor({
      symptom: { stated: 0.49, vague: 0.26, absent: 0.25 },
      goal: { stated: 0.5, vague: 0.2, absent: 0.3 },
    })
    const rows = result.elements.slice(0, 2).map((e: any) => [e.label, e.stated, e.probability])
    expect(rows).toEqual([
      ['実際に起きている問題', false, 49],
      ['最終的に実現したいこと', true, 50],
    ])
    expect(result.missing.map((m: any) => m.label)).toEqual(['実際に起きている問題'])
  })
  it('treats a stated symptom as unlikely even when a product is named', async () => {
    const result = await verdictFor({ symptom: { stated: 1, vague: 0, absent: 0 }, goal: { stated: 0.24, vague: 0.09, absent: 0.67 } })
    expect(result.verdict).toBe('unlikely')
    expect(result.label).toBe('XY問題の可能性は低い')
    expect(result.missing.map((m: any) => m.label)).toEqual(['最終的に実現したいこと'])
  })
  // 目的 X を書いたうえで手段 Y を名指しして相談する文は、XY問題を避けた書き方の典型（issue #13）。
  // 値は「5秒ごとのリロードを考えていますが…」の文に実際の Jev が返した確率に近づけている。
  it('treats a stated goal as unlikely even when a named means is asked about (issue #13)', async () => {
    const result = await verdictFor({
      symptom: { stated: 0.16, vague: 0.12, absent: 0.72 },
      goal: { stated: 0.99, vague: 0, absent: 0.01 },
      target: { named: 0.75, general: 0.24, none: 0.01 },
      ask: { cause: 0.02, means: 0.74, advice: 0.24, not_request: 0 },
    })
    expect(result.verdict).toBe('unlikely')
    expect(result.excluded).toBe(false)
    expect(result.missing.map((m: any) => m.label)).toEqual(['実際に起きている問題'])
  })
  it('keeps text from the answering side negative without asking follow-up questions (#6)', async () => {
    const result = await verdictFor({ symptom: { stated: 0, vague: 0, absent: 1 }, goal: { stated: 0, vague: 0, absent: 1 }, target: { named: 0.42, general: 0.52, none: 0.06 }, ask: { cause: 0, means: 0.15, advice: 0, not_request: 0.85 } })
    expect(result.verdict).toBe('unlikely')
    expect(result.excluded).toBe(true)
    expect(result.label).toBe('判定対象外')
    expect(result.title).toBe('質問や相談ではないようです。')
    expect(result.missing).toEqual([])
    expect(result.questions).toEqual([])
  })
})
