# XY Problem Implementation Plan

**Goal:** HonoとJevによる日本語のXY問題判定をCloudflareに公開する。

**Architecture:** Workers Assetsで画面を配信し、HonoのPOST /api/analyzeからWorkers AIを呼ぶ。判定契約と表示用の変換を独立したモジュールに置く。

**Tech Stack:** TypeScript, Hono, Cloudflare Workers AI, Wrangler, Vitest。

**Spec:** docs/superpowers/specs/2026-09-22-xy-problem-design.md

## Global Constraints

- 入力は10〜3000文字、本文16KBまで。
- ログイン・DB・履歴保存なし。本文をログ出力しない。
- Jevモデルはtypesafe/jev。実応答を検証し、偽の判定にフォールバックしない。

## Tasks

- [x] API: tests/app.test.tsに外部AIだけを置換したHonoリクエストテストを書く。`bun run test`で未実装の失敗を確認し、src/index.tsとsrc/analysis.tsを実装。成功・無効入力・不正応答・障害・制限を確認する。
- [ ] UI: public/index.html, styles.css, app.jsでフォーム、サンプル、結果、通信状態を実装。DOM textContentで結果を描画し、送信中は再送を防ぐ。PCとスマホ幅で操作確認する。
- [ ] Publish: `bun run typecheck && bun run test && bun run build`を通し、READMEに開発と公開手順を記載。`bunx wrangler whoami`で認証を確認し、`bun run deploy`。公開URLのGETとPOSTを検証する。
