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

// 登録のあとに何をすればよいかが分かるように、次の手順をここで示す（docs/discord.md の手順6・7）。
// 許可ユーザーにユーザー名を入れる取り違えが起きたため、入れるべきユーザー ID も表示する。
const installUrl = `https://discord.com/oauth2/authorize?client_id=${applicationId}&integration_type=1&scope=applications.commands`
console.log('')
console.log('次に、このリンクを開いて「アプリを追加」→「承認」と進んでください。')
console.log(installUrl)

const application = await fetch('https://discord.com/api/v10/applications/@me', {
  headers: { Authorization: `Bot ${botToken}` },
})
if (application.ok) {
  const { owner } = await application.json() as { owner?: { id: string; username: string } }
  if (owner) {
    console.log('')
    console.log(`アプリの所有者：${owner.username}（ユーザー ID：${owner.id}）`)
    console.log('Worker Secret の DISCORD_ALLOWED_USER_IDS には、ユーザー名ではなく、このユーザー ID を入れてください。')
  }
}

console.log('')
console.log('追加したら、自分のメッセージを右クリック →「アプリ」→「XY問題チェック」で試せます。')
