# XY問題チェッカー

質問文の目的と手段をTypeSafe AIのJevで評価する日本語Webアプリ。
Hono + TypeScript + Cloudflare Workers。判定はTypeSafe APIで行い、依存管理にはBunを使用する。

## 準備

- Bun 1.4.2以降
- Wrangler実行用のNode.js 22以降
- TypeSafe AI APIキー
- Cloudflareアカウント

```sh
bun install --frozen-lockfile
bunx wrangler login
bun run setup:key
bun run dev
```

ローカルURLは http://localhost:8787 。判定には有効なTypeSafe AI APIキーが必要です。`bun run setup:key`はキーを非表示で読み取り、リポジトリ外の`~/.config/typesafe/env`へ`TYPESAFE_API_KEY`として保存します（同じファイルの他の行は残す）。`bun run dev`はこのファイルと、アプリ用の名前`JEV_API_KEY`へ読み替える`dev.env`（秘密情報なし・Git管理）を読み込むため、Orcaのどのworktreeでも同じキーで動きます。ローカルで偽の判定を返すモードは設けていません。

## 検証

```sh
bun run test
bun run typecheck
bun run build
```

`bun run test` はVitestで実行する。外部AIの応答をテスト用データに置き換え、APIの変換・入力検証・失敗時の応答を検証する。実モデルの判定精度を保証するテストではない。

## Cloudflareの登録・公開

1. https://dash.cloudflare.com/sign-up で登録し、確認メールでメールアドレスを認証する。
2. `bunx wrangler login` を実行し、ブラウザでWranglerとの接続を許可する。
3. TypeSafe AIコンソールでAPIキーを作る。
4. `bun run setup:key`でローカル（`~/.config/typesafe/env`）にAPIキーを安全に保存し、`bun run dev`から実判定を確認する。
5. キーをCloudflareに保存する: `bunx wrangler secret put JEV_API_KEY`。表示された入力欄にキーを入力する。
6. Cloudflareの管理画面（Workers & Pages → xy-problem → 設定 → ビルド）でGitHubの `dewaken/xy-problem` を連携する。ブランチは `main`、ビルドコマンドは `bun run test && bun run typecheck`、デプロイコマンドは `npx wrangler deploy`。
7. `main` にpush（PRのマージを含む）すると、Workers Buildsがテストと型チェックを通したうえで本番にデプロイする。手元からはデプロイしない（`bun run deploy` は案内を出して止まる）。
8. `https://xy-problem.ken1030.workers.dev` で画面と実判定を確認する。問題があれば管理画面の Deployments から前のバージョンにロールバックする。

独自ドメインは不要。Jev APIキーはブラウザへ渡さず、Workers SecretからTypeSafe APIを呼び出す。

## ファイル

- `src/index.ts`: Hono API、入力制限、レート制限
- `src/check.ts`: 画面の API と Discord で共通の判定処理
- `src/discord.ts`: Discord のメッセージコマンド「XY問題チェック」（設定は `docs/discord.md`）
- `src/jev.ts`: Jev（TypeSafe API）の呼び出し、タイムアウト、エラーの変換
- `src/analysis.ts`: Jevに渡す質問と選択肢、応答の検証、総合判定の合成
- `scripts/eval-cases.ts`: 実Jevで判定を確認する評価ケース
- `scripts/discord-register.ts`: Discord にコマンドを登録する
- `public/`: レスポンシブUI、定型の確認質問の表示
- `wrangler.jsonc`: Workers・Assets・Rate Limitの設定

## 判定の意味

Jevには「XY問題か」を尋ねず、文章に何が書かれているかだけを尋ね、総合判定はアプリ側で合成する（`src/analysis.ts`）。

- Choice：実際に起きている問題（症状）／最終的に実現したいこと（目的）が「書かれている・はっきりしない・書かれていない」、特定の製品・設定を名指ししているか、何を求めているか（原因・特定手段・一般的な助言・回答側の発言）
- Noul：試したこと・切り分けの結果が書かれているか

| 判定 | 条件（各確率の積が50%以上、上から優先） |
|---|---|
| XY問題の疑いが強い | 名指しあり × 症状が明記されていない |
| XY問題の疑いあり | 特定手段を求めている × 目的が書かれていない × 症状が明記されていない |
| XY問題の可能性は低い | 症状か目的の少なくとも一方が明記されている、または回答側の発言 |
| 目的も問題も、まだ形になっていません | 上のいずれでもない |

画面では総合判定に加え、書かれていない要素と追記の案を示す。%は3行とも「その要素が文章に書かれている」とJevが推定した確率（stated の確率）で揃えており、判定の正解率ではない。確認質問は欠けている要素に対応する定型文。

判定基準を変えたら `bun run eval` で実際のJevに評価ケース（`scripts/eval-cases.ts`）を投げて確認する。ケース数分のAPI利用が発生する。

入力は10〜3,000文字、本文16KBまで。アプリにDB・入力履歴・本文ログはないが、判定時にはCloudflareとTypeSafe AIで処理される。Rate LimitはIPごと10回/分の緩やかな制限で、Cloudflare拠点単位。厳密な課金上限ではなく、同じIPを使う利用者は枠を共有する。

## 公式資料

- https://typesafe.ai/
- https://api.typesafe.ai/docs
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://hono.dev/docs/getting-started/cloudflare-workers
