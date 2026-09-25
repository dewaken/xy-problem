import { buildInput } from './analysis'

const endpoint = 'https://api.typesafe.ai/v1/systemone'
// ブラウザ側（public/app.js）の25秒より短くし、利用者には「時間がかかっています」をサーバーから返す。
const timeoutMs = 20_000

// 失敗の種類。利用者向けの文言は、言語に合わせて src/check.ts で選ぶ。
export type JevFailure = 'config' | 'upstream' | 'timeout' | 'failed'

// 利用者に返してよいステータスと失敗の種類だけを持つ。Jev の生のエラー内容は含めない。
export class JevError extends Error {
  constructor(readonly status: 502 | 503 | 504, readonly failure: JevFailure) {
    super(failure)
  }
}

// Jev に判定を依頼し、検証前の応答（JSON）を返す。失敗は JevError に変換する。
export async function askJev(apiKey: string, text: string): Promise<unknown> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // abort だけに頼らず、時間切れの Promise とも競わせる。signal を無視する fetch でも必ず打ち切るため。
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('timeout'))
    }, timeoutMs)
  })
  try {
    const request = fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', ...buildInput(text) }),
      signal: controller.signal,
    })
    const upstream = await Promise.race([request, timeout])
    if (upstream.status === 401 || upstream.status === 403) {
      console.error('[jev] upstream rejected request', { status: upstream.status })
      throw new JevError(503, 'config')
    }
    if (!upstream.ok) {
      console.error('[jev] upstream rejected request', { status: upstream.status })
      throw new JevError(502, 'upstream')
    }
    return await upstream.json()
  } catch (error) {
    if (error instanceof JevError) throw error
    if (controller.signal.aborted) throw new JevError(504, 'timeout')
    logFailure(error, text)
    throw new JevError(502, 'failed')
  } finally {
    clearTimeout(timer)
  }
}

// 履歴を残さない方針のため、エラーメッセージに入力文が含まれていたら伏せてからログに出す。
function logFailure(error: unknown, text: string) {
  const failure = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const cause = failure.cause && typeof failure.cause === 'object' ? failure.cause as Record<string, unknown> : {}
  const message = error instanceof Error ? error.message : failure.message
  console.error('[jev] request failed', {
    name: error instanceof Error ? error.name : typeof error,
    message: typeof message === 'string' ? message.replaceAll(text, '[redacted input]').slice(0, 240) : undefined,
    causeName: typeof cause.name === 'string' ? cause.name : undefined,
  })
}
