# Discord 連携（自分で起動する版）

Discord のメッセージを右クリック（スマホは長押し）→「アプリ」→「XY問題チェック」で、そのメッセージを判定する。結果は、実行した本人にだけ見える返信で届く。Issue #17。

- チェックできるのは、自分が投稿したメッセージだけ（他人の文章を社外に送らないため）
- 使えるのは、`DISCORD_ALLOWED_USER_IDS` に入れたユーザーだけ（未設定なら誰も使えない）
- 回数制限は、Discord のユーザーごとに 10回/分（画面の API と同じ `RATE_LIMITER` を使う）

## 仕組み

1. Discord が `POST /discord/interactions` を呼ぶ（`src/discord.ts`）
2. Worker が Ed25519 の署名を確かめ、3秒以内に「考え中」（本人にだけ見える返信）を返す
3. 応答を返したあと、`waitUntil` で判定する（判定の共通処理は `src/check.ts`）。判定サービスのタイムアウトは20秒で、`waitUntil` は応答後30秒まで動ける
4. 判定が終わったら、「考え中」の返信を結果で書き換える（interaction の token を使うので、bot の token はいらない）

## 設定の手順

順番に意味がある。Discord は Interactions Endpoint URL を保存するときに PING を送って確かめるため、先に Worker 側を用意する。

### 1. Discord アプリを作る

1. https://discord.com/developers/applications で「New Application」を押し、名前を付ける（例：XY問題チェッカー）
2. 「General Information」で、Application ID と Public Key を控える
3. 「Bot」で「Reset Token」を押し、Bot Token を控える。他の人が自分のサーバーに入れられないように、「Public Bot」はオフにする
4. 「Installation」の「Installation Contexts」で、「User Install」と「Guild Install」を有効にする。「Install Link」は「Discord Provided Link」にする

### 2. 手元に Discord の設定を置く

コマンドの登録に使う。リポジトリの外に置き、Git には入れない。

```sh
mkdir -p ~/.config/xy-problem
cat > ~/.config/xy-problem/discord.env <<'ENV'
DISCORD_APPLICATION_ID=（Application ID）
DISCORD_BOT_TOKEN=（Bot Token）
ENV
chmod 600 ~/.config/xy-problem/discord.env
```

### 3. Worker Secret を設定する

この機能を含む変更が main に入り、本番にデプロイされたあとに行う。

```sh
bunx wrangler secret put DISCORD_PUBLIC_KEY        # 手順1で控えた Public Key
bunx wrangler secret put DISCORD_ALLOWED_USER_IDS  # 自分の Discord ユーザー ID（複数ならカンマ区切り）
```

自分のユーザー ID は、Discord の「設定 → 詳細設定 → 開発者モード」をオンにしてから、自分のアイコンを右クリック →「ユーザーIDをコピー」で取れる。

### 4. Interactions Endpoint URL を設定する

Developer Portal の「General Information」→「Interactions Endpoint URL」に、次の URL を入れて保存する。

```
https://xy-problem.ken1030.workers.dev/discord/interactions
```

保存に失敗する場合は、手順3の `DISCORD_PUBLIC_KEY` が正しいかを確かめる。

### 5. コマンドを登録し、アプリをインストールする

```sh
bun run discord:register
```

「Installation」の Install Link を開き、「自分のアプリに追加」を選ぶ。メニューに出ないときは、Discord を再読み込みする（Ctrl+R / ⌘+R）。

## うまく動かないとき

- 「このアプリを使えるユーザーとして登録されていません。」：`DISCORD_ALLOWED_USER_IDS` に自分の ID が入っているか
- 「判定サービスの設定が完了していません。」：Worker Secret の `JEV_API_KEY` があるか
- 「考え中」のまま変わらない：`bunx wrangler tail` でログを見る。ログには本文を出さず、ステータスだけを出す
- 「本文のないメッセージはチェックできません」と出るのに本文がある：Discord から本文が届いていない。Developer Portal の「Bot」で「Message Content Intent」をオンにして試す（Issue #17 の「実機で確認すること」）
