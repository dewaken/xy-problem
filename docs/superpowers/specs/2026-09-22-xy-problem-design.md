# XY問題チェッカー

日本語の質問・相談文から、目的Xを見失って手段Yの解決だけを求めていないかをTypeSafe AI Jevで評価する。

## 構成

Hono + TypeScriptをCloudflare Workersにデプロイする。静的HTML/CSS/JavaScriptをWorkers Assetsで配信し、POST /api/analyzeがTypeSafe System One APIを`JEV_API_KEY`で認証して呼ぶ。APIキーはローカル開発では`.dev.vars`、公開環境ではWorkers Secretに保存する。DB、ログイン、会話履歴は設けない。

## 入出力

10〜3000文字の質問文を受け付ける。JevのChoiceでsuspected / unlikely / insufficientを選び、Noulで目的の不明瞭さ・手段への固執・前提の未検証を評価する。単なる技術質問や短文を根拠にXY問題と断定しない。結果には分類、分類のモデル確信度、観点別評価、評価に対応する定型の確認質問を表示。生成された説明や正解率と誤認させない。

## 画面

オフホワイトと深緑の落ち着いた日本語UI。入力欄、試せる3例、判定ボタン、結果領域、XY問題の簡単な説明。スマホ対応。通信中、失敗、再入力を扱い、入力の保存はしない。モデルに送信されることを明記する。

## APIと公開

JSONと文字数を検証、リクエストボディは16KB制限。同一オリジン確認、IP単位10回/分のCloudflare rate limit。モデル応答の型・値を検証し、障害は502、タイムアウトは504。本文・モデルの生エラーをログに出さない。設定不足やAPIキー認証エラーは503。公開はworkers.devを使用し、利用可能なCloudflare認証でデプロイする。

## 検証

Vitestで入力検証、応答変換、不正モデル応答、障害とレート制限を検証。TypeScript、Wrangler dry-run、ブラウザのPC/スマホ確認、公開後のHTTPと実Jev判定を実施する。
