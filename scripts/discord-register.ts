// Discord に「XY問題チェック」コマンド（メッセージの右クリックメニュー）を登録する。
// 既存のグローバルコマンドは、この一覧で置き換わる（PUT /applications/{id}/commands）。
// 使い方：bun run discord:register（~/.config/xy-problem/discord.env を読み込む）
import { commands } from '../src/discord'

const applicationId = process.env.DISCORD_APPLICATION_ID
const botToken = process.env.DISCORD_BOT_TOKEN
if (!applicationId || !botToken) {
  console.error('DISCORD_APPLICATION_ID と DISCORD_BOT_TOKEN を ~/.config/xy-problem/discord.env に設定してください。')
  process.exit(1)
}

const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})
if (!response.ok) {
  console.error(`登録に失敗しました（HTTP ${response.status}）`)
  console.error(await response.text())
  process.exit(1)
}
const registered = await response.json() as { name: string }[]
console.log(`登録しました：${registered.map((command) => command.name).join('、')}`)
