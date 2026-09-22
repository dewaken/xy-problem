# Mac mini（Orca）への作業環境移行手順

MacBook Pro のディスク容量不足のため、以降の開発を Mac mini の Orca 環境で行う。
コードはすべて GitHub（`dewaken/xy-problem`, private）にある。Git に入っていないのはローカル用 APIキー（`.dev.vars`）だけ。

## 0. 移行前の状態（MacBook Pro）

- `main` = `origin/main`（未 push の変更なし）
- 公開中: https://xy-problem.ken1030.workers.dev （Cloudflare アカウント `dewa1030@gmail.com`、`JEV_API_KEY` は Worker Secret に登録済み。移行で触る必要はない）
- Git 対象外で引き継ぐもの: `.dev.vars`（`JEV_API_KEY`）のみ。`node_modules/` `.wrangler/` `dist/` は再生成できる

## 1. Mac mini にツールを入れる

```sh
brew install gh node   # Node.js 22 以降（Wrangler 用）
curl -fsSL https://bun.sh/install | bash   # Bun 1.4.2 以降
gh --version && node --version && bun --version
```

## 2. GitHub（dewaken）でログインして clone

```sh
gh auth login --hostname github.com --git-protocol https --web   # ブラウザで dewaken を承認
gh auth status                                                    # dewaken が Active か確認
mkdir -p ~/orca/projects && cd ~/orca/projects
gh repo clone dewaken/xy-problem
cd xy-problem
```

会社アカウントも同じ Mac mini の gh に入れる場合、macOS キーチェーンに会社アカウントの認証情報が残っていると fetch/push が `Repository not found` で失敗する。そのときは、このリポジトリにだけ次の設定をする（MacBook Pro と同じ設定）。

```sh
git config --local credential.https://github.com.helper ''
git config --local --add credential.https://github.com.helper '!gh auth git-credential'
git remote set-url origin https://dewaken@github.com/dewaken/xy-problem.git
```

この設定は gh の Active アカウントのトークンを使うので、このリポジトリで作業するときは `gh auth switch --hostname github.com --user dewaken` に切り替える。

## 3. Orca にリポジトリを登録

```sh
orca repo add --path ~/orca/projects/xy-problem
orca repo list
```

（Orca アプリの UI から追加してもよい）

補足: MacBook Pro から Mac mini の Orca を遠隔で使いたい場合は、Mac mini 側で Orca のペアリングコードを発行し、MacBook Pro で `orca environment add --name mac-mini --pairing-code <コード>` を実行する（通信は Tailscale 経由）。この方法だと、コードと `node_modules` は Mac mini にだけ置かれる。

## 4. 依存と各種ログイン

```sh
bun install --frozen-lockfile
bunx wrangler login     # ブラウザで dewa1030@gmail.com を承認
bunx wrangler whoami    # アカウントを確認
```

## 5. ローカル用 APIキー（`.dev.vars`）

どちらかの方法で用意する。キーの値をチャット・Git・メモに貼らない。

- **A（推奨）: キーを入力し直す** — `bun run setup:key` を実行し、パスワードマネージャーなどに保管しているキーを入力する（入力内容は表示されない）。手元にキーがなければ https://console.typesafe.ai でローカル用のキーを新しく作る（Worker Secret のキーはそのままでよい）。
- **B: Tailscale（Taildrop）でファイルを送る** — 同じ tailnet の中だけで暗号化されて届く。Mac mini の Tailscale 上の名前は `usermac-mini`。
  ```sh
  # MacBook Pro で
  tailscale file cp ~/orca/projects/xy-problem/.dev.vars usermac-mini:
  # Mac mini で（リポジトリ直下で受け取る）
  cd ~/orca/projects/xy-problem && tailscale file get . && chmod 600 .dev.vars
  ```
  `tailscale` コマンドが見つからない場合は `/Applications/Tailscale.app/Contents/MacOS/Tailscale` を使う。Mac の GUI 版では、Finder の共有メニューから Taildrop で送ることもできる（その場合は `~/Downloads` に届くので、リポジトリ直下へ移して `chmod 600`）。

## 6. Mac mini で動作確認

```sh
bun run test        # 20 件がパスすること
bun run typecheck
bun run build       # wrangler dry-run
bun run dev         # http://localhost:8787 で実判定が HTTP 200 になること
```

deploy の確認が必要なら `bun run deploy` のあと https://xy-problem.ken1030.workers.dev で実判定する。

## 7. MacBook Pro の後片付け（手順 6 が通ってから）

```sh
cd ~/orca/projects/xy-problem
git status && git fetch && git status -sb   # 未 push の変更がないことを再確認
```

- Orca アプリから `xy-problem` リポジトリの登録を外す
- フォルダをゴミ箱へ移す（`.dev.vars` もいっしょに消える。先に手順 5 を済ませておく）:
  `mv ~/orca/projects/xy-problem ~/.Trash/`
- 手元で gh の dewaken アカウントが不要なら: `gh auth logout --hostname github.com --user dewaken`

これで約 280MB（大半は `node_modules/`）空く。
