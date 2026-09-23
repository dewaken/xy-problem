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

`DISCORD_ALLOWED_USER_IDS` には、**ユーザー ID（17〜19桁の数字だけの値）** を入れる。次の値と取り違えやすいので注意する。

| 入れる値 | 例 | |
|---|---|---|
| ユーザー ID | `123456789012345678` のような数字 | ✅ これを入れる |
| ユーザー名 | `your_name` のような名前 | ❌ 使えない |
| Application ID | 手順1で控えた値 | ❌ アプリの ID で、人の ID ではない |

ユーザー ID の調べ方：

1. Discord の「ユーザー設定 → 詳細設定」で「開発者モード」をオンにする
2. 自分のアイコン（または名前）を右クリックし、「ユーザーIDをコピー」を選ぶ

アプリを自分で作った場合は、`bun run discord:register`（手順5）が表示する「アプリの所有者」の ID と同じになる。

### 4. Interactions Endpoint URL を設定する

Developer Portal の「General Information」→「Interactions Endpoint URL」に、次の URL を入れて保存する。

```
https://xy-problem.ken1030.workers.dev/discord/interactions
```

保存に失敗する場合は、手順3の `DISCORD_PUBLIC_KEY` が正しいかを確かめる。

### 5. コマンドを登録する

```sh
bun run discord:register
```

「登録しました：XY問題チェック」のあとに、次の手順で使うインストール用のリンクと、アプリの所有者のユーザー ID が表示される。

### 6. アプリを自分のアカウントに追加する

手順5で表示されたリンクを開き、「アプリを追加」→「承認」と進む。リンクの形は次のとおり（`（Application ID）` を置き換える）。

```
https://discord.com/oauth2/authorize?client_id=（Application ID）&integration_type=1&scope=applications.commands
```

### 7. 試す

1. 自分が投稿した10文字以上のメッセージを右クリック（スマホは長押し）→「アプリ」→「XY問題チェック」を選ぶ
2. 「考え中」が出て、数秒後に判定結果に変われば完了（結果は自分にだけ見える）

- メニューに「XY問題チェック」が出ないときは、Discord を再読み込みする（⌘+R / Ctrl+R）
- 試しやすい例文：「文字列の最後の3文字を取り出す方法を教えてください。」（「XY問題の疑いあり」になる）

## うまく動かないとき

- 「このアプリを使えるユーザーとして登録されていません。」：`DISCORD_ALLOWED_USER_IDS` にユーザー ID（数字）が入っているかを確かめる。ユーザー名や Application ID を入れていないか（手順3）。直すときは `bunx wrangler secret put DISCORD_ALLOWED_USER_IDS` で上書きする
- 「判定サービスの設定が完了していません。」：Worker Secret の `JEV_API_KEY` があるか
- 「考え中」のまま変わらない：`bunx wrangler tail` でログを見る。ログには本文を出さず、ステータスだけを出す
- Interactions Endpoint URL を保存できない：`DISCORD_PUBLIC_KEY` が手順1の Public Key と同じか

右クリック版は、Developer Portal の「Message Content Intent」がオフのままで本文を受け取れる（2026-09-23 に実機で確認）。この設定が要るのは、投稿を自動で拾う常駐 bot（#18）のほう。
