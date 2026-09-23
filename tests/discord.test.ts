import type { ExecutionContext } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import app, { type Bindings } from '../src/index'
import type { Analysis } from '../src/check'
import { COMMAND_NAME, discordMessage } from '../src/discord'

const me = '111111111111111111'
const someoneElse = '222222222222222222'
const text = '文字列の最後の3文字を取り出す方法を教えてください。'

// Jev の応答（「開発の質問」の例文に近い値。suspected になる）。
const jevResult = {
  model: 'jev-1.13.0',
  answers: {
    symptom: { type: 'choice', choice: 'absent', confidence: 0.9, probabilities: { stated: 0, vague: 0.05, absent: 0.95 } },
    goal: { type: 'choice', choice: 'absent', confidence: 0.9, probabilities: { stated: 0, vague: 0.1, absent: 0.9 } },
    target: { type: 'choice', choice: 'general', confidence: 0.9, probabilities: { named: 0.1, general: 0.8, none: 0.1 } },
    ask: { type: 'choice', choice: 'means', confidence: 0.9, probabilities: { cause: 0, means: 0.95, advice: 0.05, not_request: 0 } },
    tried: { type: 'noul', noul: 0.04 },
  },
}

let keyPair: CryptoKeyPair
let publicKeyHex: string

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
  publicKeyHex = toHex(await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer)
})

function env(overrides: Partial<Bindings> = {}): Bindings {
  return {
    JEV_API_KEY: 'test-api-key',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    DISCORD_PUBLIC_KEY: publicKeyHex,
    DISCORD_ALLOWED_USER_IDS: me,
    ...overrides,
  }
}

// Jev と Discord への fetch を、宛先ごとに偽の応答へ振り分ける。
function mockFetch(jev: () => Response = () => Response.json(jevResult)) {
  const request = vi.fn(async (url: RequestInfo | URL, _options?: RequestInit) => {
    if (String(url).startsWith('https://api.typesafe.ai/')) return jev()
    return new Response('{}', { status: 200 })
  })
  vi.stubGlobal('fetch', request)
  return request
}

function commandInteraction({ invoker = me, author = me, content = text } = {}) {
  return {
    type: 2,
    token: 'interaction-token',
    application_id: 'app-id',
    member: { user: { id: invoker } },
    data: {
      type: 3,
      name: COMMAND_NAME,
      target_id: 'message-id',
      resolved: { messages: { 'message-id': { id: 'message-id', content, author: { id: author } } } },
    },
  }
}

async function sign(body: string, timestamp: string) {
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, new TextEncoder().encode(timestamp + body))
  return toHex(signature)
}

// waitUntil に渡された処理を集め、テストの中で終わるまで待てるようにする。
function executionContext() {
  const pending: Promise<unknown>[] = []
  return {
    context: { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException: () => {}, props: {} },
    settle: () => Promise.all(pending),
  }
}

async function send(interaction: unknown, { bindings = env(), signature }: { bindings?: Bindings; signature?: string } = {}) {
  const body = JSON.stringify(interaction)
  const timestamp = '1790000000'
  const execution = executionContext()
  const response = await app.request('http://localhost/discord/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature ?? await sign(body, timestamp),
      'X-Signature-Timestamp': timestamp,
    },
    body,
  }, bindings, execution.context as unknown as ExecutionContext)
  return { response, settle: execution.settle }
}

beforeEach(() => { mockFetch() })
afterEach(() => { vi.unstubAllGlobals() })

describe('Discord interactions', () => {
  it('answers PING with PONG', async () => {
    const { response } = await send({ type: 1 })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ type: 1 })
  })

  it('rejects requests with an invalid signature', async () => {
    const { response } = await send({ type: 1 }, { signature: 'ab'.repeat(64) })
    expect(response.status).toBe(401)
  })

  it('rejects requests signed for a different body', async () => {
    const signature = await sign(JSON.stringify({ type: 1 }), '1790000000')
    const { response } = await send({ type: 1, extra: true }, { signature })
    expect(response.status).toBe(401)
  })

  it('returns 503 when the public key is not configured', async () => {
    const { response } = await send({ type: 1 }, { bindings: env({ DISCORD_PUBLIC_KEY: undefined }) })
    expect(response.status).toBe(503)
  })

  it('defers with an ephemeral reply, then edits it with the verdict', async () => {
    const fetchRequest = mockFetch()
    const { response, settle } = await send(commandInteraction())
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } })
    await settle()

    const [jevUrl, jevOptions] = fetchRequest.mock.calls[0]
    expect(String(jevUrl)).toBe('https://api.typesafe.ai/v1/systemone')
    expect(JSON.parse(String(jevOptions?.body)).state).toContain(text)

    const [editUrl, editOptions] = fetchRequest.mock.calls[1]
    expect(String(editUrl)).toBe('https://discord.com/api/v10/webhooks/app-id/interaction-token/messages/@original')
    expect(editOptions?.method).toBe('PATCH')
    const edited = JSON.parse(String(editOptions?.body))
    expect(edited.embeds[0].title).toBe('XY問題の疑いあり')
    expect(edited.allowed_mentions).toEqual({ parse: [] })
  })

  it('edits the reply with a user-facing error when the judge fails', async () => {
    const fetchRequest = mockFetch(() => new Response('{}', { status: 500 }))
    const { settle } = await send(commandInteraction())
    await settle()
    const edited = JSON.parse(String(fetchRequest.mock.calls[1][1]?.body))
    expect(edited.content).toBe('判定サービスに接続できませんでした。時間をおいてお試しください。')
    expect(JSON.stringify(edited)).not.toContain('Jev')
  })

  it("refuses to check someone else's message without calling the judge", async () => {
    const fetchRequest = mockFetch()
    const { response } = await send(commandInteraction({ author: someoneElse }))
    const body = await response.json()
    expect(body.type).toBe(4)
    expect(body.data.flags).toBe(64)
    expect(body.data.content).toBe('自分が投稿したメッセージだけチェックできます。')
    expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('refuses users who are not on the allow list', async () => {
    const fetchRequest = mockFetch()
    const { response } = await send(commandInteraction({ invoker: someoneElse, author: someoneElse }))
    expect((await response.json()).data.content).toBe('このアプリを使えるユーザーとして登録されていません。')
    expect(fetchRequest).not.toHaveBeenCalled()
  })

  it('refuses everyone when the allow list is not configured', async () => {
    const { response } = await send(commandInteraction(), { bindings: env({ DISCORD_ALLOWED_USER_IDS: undefined }) })
    expect((await response.json()).data.content).toBe('このアプリを使えるユーザーとして登録されていません。')
  })

  it('finds the invoker in user when the command runs in a DM', async () => {
    const interaction = { ...commandInteraction(), member: undefined, user: { id: me } }
    const { response, settle } = await send(interaction)
    expect((await response.json()).type).toBe(5)
    await settle()
  })

  it('explains why messages without text or with the wrong length are not checked', async () => {
    const empty = await send(commandInteraction({ content: '' }))
    expect((await empty.response.json()).data.content).toBe('本文のないメッセージはチェックできません（画像だけの投稿など）。')
    const short = await send(commandInteraction({ content: '短い文' }))
    expect((await short.response.json()).data.content).toBe('10〜3,000文字のメッセージだけチェックできます。')
  })

  it('counts the rate limit per Discord user', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const { response } = await send(commandInteraction(), { bindings: env({ RATE_LIMITER: { limit } }) })
    expect(limit).toHaveBeenCalledWith({ key: `xy-discord:${me}` })
    expect((await response.json()).data.content).toBe('利用が集中しています。1分ほど待ってから、もう一度お試しください。')
  })

  it('rejects other interactions', async () => {
    const { response } = await send({ ...commandInteraction(), data: { type: 1, name: 'other' } })
    expect(response.status).toBe(400)
  })
})

describe('discordMessage', () => {
  const analysis: Analysis = {
    verdict: 'strong',
    excluded: false,
    label: 'XY問題の疑いが強い',
    title: '手段は具体的なのに、起きている問題が書かれていません。',
    description: '説明',
    missing: [{ label: '実際に起きている問題', hint: 'エラー、表示されない、遅いなど、実際に何が起きているかを書いてください。' }],
    elements: [
      { label: '実際に起きている問題', stated: false, probability: 12 },
      { label: '最終的に実現したいこと', stated: true, probability: 80 },
      { label: '試したこと・切り分けの結果', stated: false, probability: 5 },
    ],
    questions: ['実際にどんな現象が起きていますか？'],
  }

  it('labels every percentage as the probability of being written, and names where the text was sent', () => {
    const embed = discordMessage(analysis).embeds[0]
    const elements = embed.fields.find((field) => field.name === '読み取った要素')?.value.split('\n') ?? []
    expect(elements).toHaveLength(3)
    for (const row of elements) expect(row).toMatch(/書かれている可能性 \d+%$/)
    expect(embed.footer.text).toContain('Cloudflare・TypeSafe AI')
    expect(JSON.stringify(embed)).not.toContain('Jev')
  })

  it('links the title to the message when a URL is given', () => {
    expect(discordMessage(analysis, 'https://discord.com/channels/1/2/3').embeds[0].url).toBe('https://discord.com/channels/1/2/3')
  })

  it('uses the neutral color for the not-request verdict', () => {
    const excluded = discordMessage({ ...analysis, verdict: 'unlikely', excluded: true, missing: [], questions: [] }).embeds[0]
    expect(excluded.color).toBe(0x9aa293)
    expect(excluded.fields.map((field) => field.name)).toEqual(['読み取った要素'])
  })
})
