# ブランチ名のルール

作業は main から切ったブランチで行い、PR でマージする。ブランチ名は `{種類}/{Issue番号}-{英小文字の kebab-case}` にする。

| 種類 | 使うとき |
|---|---|
| `feature/` | 機能の追加・改善（画面の変更を含む） |
| `bugfix/` | 不具合の修正（判定ロジックの修正を含む） |
| `chore/` | 設定・依存関係・ドキュメントなど、アプリの動きを変えない変更 |

- 例：`feature/17-discord-context-menu`、`bugfix/13-strong-with-goal`
- Issue がないときは番号を省く（例：`chore/branch-naming`）
- `hotfix/` は作らない。main がそのまま本番で、リリース用のブランチもないため、`bugfix/` と役割が変わらない。
