import { parseAnalysis } from './analysis'
import { askJev, JevError } from './jev'

export type Analysis = ReturnType<typeof parseAnalysis>
export type CheckResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; status: 502 | 503 | 504; error: string }

// 画面の API と Discord で共通の判定処理。Jev に尋ね、応答を検証して表示用のデータにする。
// 失敗は、利用者に見せてよいメッセージとステータスだけにして返す（Jev の生のエラーは含めない）。
export async function check(apiKey: string, text: string): Promise<CheckResult> {
  let response: unknown
  try {
    response = await askJev(apiKey, text)
  } catch (error) {
    if (error instanceof JevError) {
      return { ok: false, status: error.status, error: error.message }
    }
    throw error
  }
  try {
    return { ok: true, analysis: parseAnalysis(response) }
  } catch (error) {
    console.error('[jev] response validation failed', { name: error instanceof Error ? error.name : typeof error })
    return { ok: false, status: 502, error: '判定結果を読み取れませんでした。時間をおいてもう一度お試しください。' }
  }
}
