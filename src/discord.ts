import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { check, type Analysis, type CheckResult } from './check'
import { localeFromDiscord, messages, type Locale } from './i18n'
import type { Bindings } from './index'

type Env = { Bindings: Bindings }

// Discord の値（https://docs.discord.com/developers/interactions/receiving-and-responding）。
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const
const CallbackType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const
const CommandType = {
  MESSAGE: 3,
} as const
// 返信を、実行した本人にだけ見えるようにするフラグ（1 << 6）。
const EPHEMERAL = 64

const MIN_LENGTH = 10
const MAX_LENGTH = 3000

export const COMMAND_NAME = 'XY問題チェック'

// メッセージの右クリックメニューに出すコマンド。scripts/discord-register.ts で登録する。
// integration_types の 0 はサーバーへのインストール、1 はユーザーへのインストール。
// ユーザーにインストールすれば、bot を入れていないサーバーでも使える。
// contexts の 0 はサーバー、1 は bot との DM、2 はグループ DM などその他の場所。
// 英語設定の Discord ではメニューに英語名を出す。interaction の data.name は既定の名前（日本語）のまま届く。
export const commands = [
  {
    name: COMMAND_NAME,
    name_localizations: {
      'en-US': 'XY Problem Check',
      'en-GB': 'XY Problem Check',
    },
    type: CommandType.MESSAGE,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
  },
]

type DiscordUser = { id: string }
type DiscordMessage = { id: string; content?: string; author?: DiscordUser }
type Interaction = {
  type: number
  token: string
  application_id: string
  // 実行した人の Discord の言語設定（例：ja、en-US）。返信の言語に使う。
  locale?: string
  member?: { user?: DiscordUser }
  user?: DiscordUser
  data?: {
    type?: number
    name?: string
    target_id?: string
    resolved?: { messages?: Record<string, DiscordMessage> }
  }
}

// 判定ごとの色（public/styles.css の verdict の色に合わせる）。
const colors = {
  strong: 0xc9643f,
  suspected: 0xd29d2d,
  borderline: 0x8591a9,
  unlikely: 0x6b9950,
  excluded: 0x9aa293,
}

// 判定結果を Discord のメッセージ（埋め込み）にする。常駐 bot（#18）からも使う。
// 表示の決まりは画面と同じ。「Jev」を出さず、送信先を書き、%は3行とも「書かれている可能性」にする。
export function discordMessage(analysis: Analysis, locale: Locale, messageUrl?: string) {
  const text = messages(locale).discord
  const fields: { name: string; value: string }[] = []
  if (analysis.missing.length) {
    fields.push({
      name: text.missingField,
      value: analysis.missing.map((item) => `・**${item.label}**\n${item.hint}`).join('\n'),
    })
  }
  if (analysis.questions.length) {
    fields.push({
      name: text.questionsField,
      value: analysis.questions.map((question) => `> ${question}`).join('\n'),
    })
  }
  fields.push({
    name: text.elementsField,
    value: analysis.elements
      .map((element) => `${element.stated ? '✅' : '⬜'} ${text.elementRow(element.label, element.probability)}`)
      .join('\n'),
  })
  return {
    embeds: [
      {
        title: analysis.label,
        url: messageUrl,
        description: `**${analysis.title}**\n${analysis.description}`,
        color: analysis.excluded ? colors.excluded : colors[analysis.verdict],
        fields,
        footer: { text: text.footer },
      },
    ],
    allowed_mentions: { parse: [] },
  }
}

// Discord からのリクエストであることを、Ed25519 の署名で確かめる。
// 署名の対象は「タイムスタンプ + 本文（生の文字列）」。
export async function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, body: string) {
  const publicKey = hexToBytes(publicKeyHex)
  const signature = hexToBytes(signatureHex)
  if (!publicKey || publicKey.length !== 32) return false
  if (!signature || signature.length !== 64) return false
  if (!timestamp) return false
  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, new TextEncoder().encode(timestamp + body))
  } catch {
    return false
  }
}

function hexToBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function allowedUsers(value: string | undefined) {
  return new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean))
}

// 本人にだけ見える返信を、すぐに返す。判定しない場合（断る・入力の誤り）に使う。
function reply(c: Context<Env>, content: string) {
  return c.json({
    type: CallbackType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  })
}

// 判定して、先に返した「考え中」の返信を結果で書き換える。応答を返したあとに waitUntil で動く。
async function completeCheck(interaction: Interaction, apiKey: string, text: string, locale: Locale) {
  let result: CheckResult
  try {
    result = await check(apiKey, text, locale)
  } catch {
    result = { ok: false, status: 502, error: messages(locale).errors.jevFailed }
  }
  const payload = result.ok
    ? discordMessage(result.analysis, locale)
    : { content: result.error, allowed_mentions: { parse: [] } }
  // interaction の token は15分有効で、この書き換えには bot の token がいらない。
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      console.error('[discord] failed to edit the response', { status: response.status })
    }
  } catch (error) {
    console.error('[discord] failed to edit the response', { name: error instanceof Error ? error.name : typeof error })
  }
}

async function handleCheckCommand(c: Context<Env>, interaction: Interaction) {
  const locale = localeFromDiscord(interaction.locale)
  const text = messages(locale).discord
  const errors = messages(locale).errors
  // サーバーでは member.user、DM では user に、実行した人が入る。
  const user = interaction.member?.user ?? interaction.user
  // 判定サービスの利用料を守るため、許可したユーザーだけが使える。未設定なら誰も使えない。
  if (!user || !allowedUsers(c.env?.DISCORD_ALLOWED_USER_IDS).has(user.id)) {
    return reply(c, text.notAllowed)
  }

  const targetId = interaction.data?.target_id
  const message = targetId ? interaction.data?.resolved?.messages?.[targetId] : undefined
  if (!message) {
    return reply(c, text.unreadableMessage)
  }
  // 他人の文章を社外（Cloudflare・TypeSafe AI）に送らないため、自分の投稿だけを対象にする。
  if (message.author?.id !== user.id) {
    return reply(c, text.notOwnMessage)
  }
  const content = (message.content ?? '').trim()
  if (!content) {
    return reply(c, text.noText)
  }
  if (content.length < MIN_LENGTH || content.length > MAX_LENGTH) {
    return reply(c, text.length)
  }

  const apiKey = c.env?.JEV_API_KEY
  const rateLimiter = c.env?.RATE_LIMITER
  if (!apiKey || !rateLimiter) {
    return reply(c, text.notConfigured)
  }
  // 画面の API（IP ごと）とは別に、Discord のユーザーごとに数える。上限は同じ 10回/分。
  let allowed: boolean
  try {
    allowed = (await rateLimiter.limit({ key: `xy-discord:${user.id}` })).success
  } catch {
    return reply(c, errors.rateLimiterDown)
  }
  if (!allowed) {
    return reply(c, errors.busy)
  }

  // Discord には3秒以内に応答する必要があり、判定（最大20秒）を待てない。
  // 先に「考え中」を返し、判定は応答後に続ける（waitUntil は応答後30秒まで動ける）。
  c.executionCtx.waitUntil(completeCheck(interaction, apiKey, content, locale))
  return c.json({
    type: CallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  })
}

// Discord のメッセージ本文は最大4,000文字。対象メッセージの情報を含めても収まる上限にする。
const limitBody = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ error: 'request body too large' }, 413),
})

export const discord = new Hono<Env>()

discord.post('/interactions', limitBody, async (c) => {
  const publicKey = c.env?.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    return c.json({ error: 'Discord の設定が完了していません。' }, 503)
  }
  const body = await c.req.text()
  const signature = c.req.header('X-Signature-Ed25519') ?? ''
  const timestamp = c.req.header('X-Signature-Timestamp') ?? ''
  // Discord は署名の検証を必須にしており、不正な署名には 401 を返すよう求めている。
  if (!(await verifySignature(publicKey, signature, timestamp, body))) {
    return c.json({ error: 'invalid request signature' }, 401)
  }

  let interaction: Interaction
  try {
    interaction = JSON.parse(body)
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }
  if (interaction.type === InteractionType.PING) {
    return c.json({ type: CallbackType.PONG })
  }
  const isCheckCommand =
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.type === CommandType.MESSAGE &&
    interaction.data.name === COMMAND_NAME
  if (!isCheckCommand) {
    return c.json({ error: 'unsupported interaction' }, 400)
  }
  return handleCheckCommand(c, interaction)
})
