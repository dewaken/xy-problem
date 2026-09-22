# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, etc.) when working with code in this repository.

XY Lens：日本語の質問・相談文が「XY問題」になっていないかを判定する Web アプリ。Hono + TypeScript を Cloudflare Workers で動かし、判定には TypeSafe AI の Jev（System One API）を使う。パッケージ管理は Bun。

## コマンド

```sh
bun run dev          # http://localhost:8787 （~/.config/typesafe/env と dev.env を読み込む）
bun run test         # Vitest（Jev への fetch はモック）
bunx vitest run -t "flags a named target"   # テストを1件だけ実行
bun run typecheck
bun run build        # wrangler deploy --dry-run
bun run eval         # 実際の Jev に評価ケースを投げる。ケース数分の API 利用が発生する
bun run eval '#1' ex-infra   # ケース ID を指定して一部だけ実行
bun run setup:key    # TypeSafe API キーを ~/.config/typesafe/env に保存
```

ローカルの API キーはリポジトリの外、`~/.config/typesafe/env` の `TYPESAFE_API_KEY` に置く。`dev.env`（Git 管理、秘密情報なし）が、これをアプリ側の名前 `JEV_API_KEY` に読み替える。本番では Worker Secret の `JEV_API_KEY` を使う。偽の判定を返すモードはない。

## 構成

- `src/index.ts`：`POST /api/analyze`。前段のチェックを名前付きのミドルウェアとして並べ、`app.post(...)` の引数の順に実行する（本文16KB → 同一オリジン → JSON → 文字数 → 設定 → Rate Limit）。壊れた JSON は Hono の `validator` が `HTTPException(400)` を投げるので、`app.onError` で 400 に変換している。
- `src/jev.ts`：Jev の呼び出し（20秒タイムアウト）。失敗は利用者向けのメッセージとステータスだけを持つ `JevError` に変える。ログに入力本文や Jev の生エラーを出さない（本文は伏せる）。
- `src/analysis.ts`：判定ロジックの本体。
  - `buildInput`：Jev への質問を組み立てる。
  - `rawScores`：応答を検証し、確率を取り出す。
  - `parseAnalysis`：総合判定と表示用データを作る。
- `public/`：ビルドなしの素の HTML/CSS/JS（Workers Assets）。`_headers` の CSP により、インラインスクリプトと外部スクリプトは使えない。
- `scripts/eval-cases.ts`：実際の Jev で判定を確かめる評価ケース集。依頼書の #1〜#6 と、画面の例文を含む。

## 判定の設計

Jev は文章を生成しない。事前に定義した質問と選択肢に対して、確率を返すだけのモデルである。そのため、判定の改善は「プロンプトの工夫」ではなく、次の3つで行う。

- 質問文の定義
- 選択肢（criteria）の定義
- アプリ側での確率の合成

- Jev には「XY問題か」を尋ねない。文章に何が書かれているかだけを尋ねる。
  - `symptom`：実際に起きている問題
  - `goal`：最終的に実現したいこと
  - `target`：特定の製品・設定を名指ししているか
  - `ask`：何を求めているか。`not_request` は回答側の発言を表す
  - `tried`：試したこと・切り分けの結果（noul）
- 総合判定は、`parseAnalysis` の中で確率の積から決める。判定は `strong` / `suspected` / `borderline` / `unlikely` の4つ。
  - 典型的な XY 問題を陰性と言い切るコストが高い。そのため `unlikely` は「症状か目的の少なくとも一方が明記されている」場合（または回答側の発言）に限る。
- 総合判定を Jev に別途尋ねてはいけない。表示する要素と総合判定が矛盾しないことが、この設計の前提になっている。
- 判定基準の背景と受け入れ条件は `docs/xy-judge-fix-instructions.md` にある。criteria や合成ルールを変えたら、`bun run test` に加えて `bun run eval` で実際の Jev の結果を確認する。

## コードの書き方

- 条件・メッセージ・ステータスを1行に詰め込まない。チェックは1つずつ改行して書き、数値の根拠や設計の理由（なぜ20秒か、なぜ伏せるか）はコメントに残す。既存のコードに詰め込まれた箇所があっても、それに合わせない。
- `public/styles.css` は整形済みの形で編集する（1行に詰めない）。

## UI の決まり

- 利用者向けの文言に「Jev」を出さない（「AI」「判定サービス」と書く）。送信先を開示する「Cloudflare・TypeSafe AI に送信」の注記は残す。
- 総合的な確信度は表示しない。要素の%は3行とも「書かれている可能性」（stated の確率）に揃える。最大確率の選択肢を出すと、行ごとに数値の意味が変わって比べられなくなる（issue #2）。判定の正解率ではないことが画面上で分かるようにする。
- 「例で試す」のボタンは、それぞれ別の判定になるようにする（現在は疑いあり／疑いが強い／可能性は低い）。例文を変えたら `scripts/eval-cases.ts` のケースも更新し、eval で判定を確かめる。
- 入力履歴や DB は持たない。

## 公開

`bun run deploy` で https://xy-problem.ken1030.workers.dev に公開する。GitHub のアカウント設定と、別の環境への移行手順は `docs/mac-mini-migration.md` を参照。
