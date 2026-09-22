# XY Lens

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

ローカルURLは http://localhost:8787 。判定には有効なTypeSafe AI APIキーが必要です。`bun run setup:key`はキーを非表示で読み取り、Git対象外の`.dev.vars`へ保存します。ローカルで偽の判定を返すモードは設けていません。

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
4. `bun run setup:key`でローカルにAPIキーを安全に保存し、`bun run dev`から実判定を確認する。
5. キーをCloudflareに保存する: `bunx wrangler secret put JEV_API_KEY`。表示された入力欄にキーを入力する。
6. `bun run deploy` で公開する。
7. `https://xy-problem.ken1030.workers.dev` で画面と実判定を確認する。

独自ドメインは不要。Jev APIキーはブラウザへ渡さず、Workers SecretからTypeSafe APIを呼び出す。

## ファイル

- `src/index.ts`: Hono API、入力制限、レート制限、タイムアウト
- `src/analysis.ts`: Jevに渡す評価基準、応答の検証と表示用変換
- `public/`: レスポンシブUI、定型の確認質問の表示
- `wrangler.jsonc`: Workers・Assets・Rate Limitの設定

## 判定の意味

Choiceで「疑いあり」「可能性は低い」「情報不足」を分類し、Noulで「目的が見えにくい」「手段への固執」「未検証の前提」の可能性を示す。確信度や各観点の数値はモデルの推定であり、正解率や実測値ではない。確認質問は観点ごとに用意した定型文。

入力は10〜3,000文字、本文16KBまで。アプリにDB・入力履歴・本文ログはないが、判定時にはCloudflareとTypeSafe AIで処理される。Rate LimitはIPごと10回/分の緩やかな制限で、Cloudflare拠点単位。厳密な課金上限ではなく、同じIPを使う利用者は枠を共有する。

## 公式資料

- https://typesafe.ai/
- https://api.typesafe.ai/docs
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://hono.dev/docs/getting-started/cloudflare-workers
