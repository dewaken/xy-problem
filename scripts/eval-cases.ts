// 実際のJevに評価ケースを投げ、要素の確率と総合判定を一覧する（APIを件数分消費する）。
// 実行: bun run eval   （~/.config/typesafe/env の TYPESAFE_API_KEY を使う）
import { buildInput, parseAnalysis, rawScores, type Verdict } from '../src/analysis'

const positive: Verdict[] = ['strong', 'suspected']
const cases: { id: string; text: string; expect: Verdict[] }[] = [
  { id: '#1', text: 'Bot Manager の設定変更はあったか。Cookie サイズが大きいようだが以前からか', expect: positive },
  { id: '#2', text: 'インフラチームには Bot Manager の cookie 書き込み適正化をチェックいただきたい', expect: positive },
  // issue #4 で挙がった #2 の全文。症状が vague で製品を名指ししているので、ex-infra と同じく strong が先に成立する。
  { id: '#2-full', text: '最近、Cookieの合計が8kbを超える方が多くなってきているようなので、インフラチームには Akamai Bot Manager での cookie周りの書き込みが適正化をチェック頂ければと思っています。', expect: positive },
  { id: '#3',text: 'デプロイ先が分かれる。そのためパスの書き換えが Akamai で必要になる認識', expect: positive },
  { id: '#4', text: 'リソースを借りるにあたり工数感の目安を立てていただけないか', expect: [...positive, 'borderline'] },
  { id: '#5', text: 'このプロプランで本当にいいのか、セキュリティや設定の面で', expect: ['borderline', ...positive] },
  { id: '#6', text: 'どのパスをどのドメインに向けたいかという情報が必要になります', expect: ['unlikely'] },
  { id: 'ex-technical', text: '文字列の最後の3文字を取り出す方法を教えてください。', expect: ['suspected'] },
  { id: 'ctl-goal', text: 'ファイル形式を判定したいので、ファイル名の末尾3文字を取得する方法を教えてください。', expect: [...positive, 'unlikely'] },
  { id: 'ex-infra', text: '最近、CDNの設定周りに何か変更はありましたでしょうか。不正Bot対策で出力するCookieのサイズが大きいようなのですが、これは以前からのものかどうか、ご存知でしょうか。', expect: ['strong'] },
  { id: 'ex-infra-good', text: 'Salesforceにアップした画像をサイト内から呼び出すと読み込めないことがあります。S3から RequestHeaderSectionTooLarge（上限8192バイト）が返っており、Cookieの合計がヘッダー上限を超えているのではないかと見ていますが、切り分けはできていません。確認すべき点があれば教えていただけますか。', expect: ['unlikely'] },
  { id: 'ex-clear', text: '問い合わせへの初回返信を24時間以内にしたいです。現在は担当者が不明な問い合わせが放置されています。予算をかけず、5人のチームで担当を決めて対応状況を共有する方法を比較したいです。', expect: ['unlikely'] },
  // issue #13：手段 Y だけを尋ねる質問と、目的 X を添えて書き直した質問の組。
  { id: '13-web-y', text: 'JavaScriptで5秒ごとにページをリロードする方法を教えてください', expect: positive },
  { id: '13-web-xy', text: 'サーバー側のデータが更新されたら、ユーザーがページを再読み込みしなくても最新情報を画面に反映したいです。\n5秒ごとのリロードを考えていますが、より適切な実装方法はありますか？', expect: ['unlikely'] },
  { id: '13-ops-y', text: 'Excelファイルを毎朝自動でメール添付する方法はありますか？', expect: positive },
  { id: '13-ops-xy', text: 'チームメンバーが毎朝、最新の売上状況を簡単に確認できるようにしたいです。\nExcelをメール添付で自動送信する方法を考えていますが、他に適した方法があれば教えてください。', expect: ['unlikely'] },
  { id: 'ctl-symptom', text: 'Salesforce にアップロードした画像が、社外ユーザーの画面でだけ表示されません。ブラウザの開発者ツールでは画像リクエストが 403 になっています。原因の切り分け方を相談させてください。', expect: ['unlikely'] },
  // 英語の入力。en-ex-* は英語表示の「例文で試す」と同じ文（日本語の例文と同じ3種類の判定になること）。
  { id: 'en-ex-technical', text: 'How do I get the last three characters of a string?', expect: ['suspected'] },
  { id: 'en-ex-infra', text: 'Has anything changed recently in the CDN settings? The cookies set by our bot protection seem to be large. Do you know whether they have always been this size?', expect: ['strong'] },
  { id: 'en-ex-infra-good', text: 'Images uploaded to Salesforce sometimes fail to load when our site requests them. S3 returns RequestHeaderSectionTooLarge (limit: 8192 bytes). We suspect the total size of the cookies exceeds the header limit, but we have not isolated the cause yet. Could you tell us what we should check?', expect: ['unlikely'] },
  { id: 'en-13-web-y', text: 'How can I reload a page every 5 seconds with JavaScript?', expect: positive },
  { id: 'en-13-web-xy', text: 'When data on the server is updated, I want the latest information to appear on the screen without users reloading the page.\nI am thinking of reloading every 5 seconds, but is there a better way to implement this?', expect: ['unlikely'] },
  { id: 'en-6', text: 'We will need to know which paths you want to point to which domains.', expect: ['unlikely'] },
]

const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error('TYPESAFE_API_KEY is not set')
const only = process.argv.slice(2)
let failed = 0
const p = (v: number) => String(Math.round(v * 100)).padStart(3)
for (const c of cases.filter((c) => !only.length || only.includes(c.id))) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', ...buildInput(c.text) }),
  })
  if (!res.ok) throw new Error(`${c.id}: HTTP ${res.status}`)
  const json = await res.json()
  const s = rawScores(json)
  const { verdict } = parseAnalysis(json)
  const ok = c.expect.includes(verdict)
  if (!ok) failed++
  console.log(`${ok ? 'OK ' : 'NG '} ${c.id.padEnd(12)} ${verdict.padEnd(10)} | symptom S${p(s.symptom.stated)} V${p(s.symptom.vague)} A${p(s.symptom.absent)} | goal S${p(s.goal.stated)} V${p(s.goal.vague)} A${p(s.goal.absent)} | target N${p(s.target.named)} G${p(s.target.general)} | ask C${p(s.ask.cause)} M${p(s.ask.means)} A${p(s.ask.advice)} X${p(s.ask.not_request)} | tried ${p(s.tried)}`)
}
if (failed) { console.log(`${failed} case(s) did not match`); process.exit(1) }
