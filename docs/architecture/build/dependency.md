# ビルドと依存: 足す依存

ステータス: **正典**。入口は `docs/architecture/build.md`（ビルドと依存の全体）。

責務: 足す依存の一覧（承認済み）と、足す外部コマンド。
読む時: 依存・外部コマンドを足すとき。
直す時: 依存の一覧や、足す外部コマンドを変えたとき。

## ビルドと依存

### 足す依存

**足す依存**（**ユーザーの承認済み**。ここに無いものを足すときは改めて承認を得る。承認の日付は
`docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）:

| 種別    | パッケージ                                                                                                                          | 用途                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runtime | `react` `react-dom`                                                                                                                 | browser                                                                                                                                                                    |
| runtime | `ws`                                                                                                                                | core の WebSocket サーバ                                                                                                                                                   |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`                                                     | Markdown                                                                                                                                                                   |
| runtime | `remark-cjk-friendly`                                                                                                               | CJK の強調（`**「…」**`）                                                                                                                                                  |
| runtime | `unified`                                                                                                                           | サーバで Markdown を構文木にする口（質問の preview の画像を拾う）。承認済み（利用者決定）                                                                                  |
| runtime | `remark-parse`                                                                                                                      | サーバで Markdown を読む段（`react-markdown` と同じ版）。承認済み（利用者決定）                                                                                            |
| runtime | `remeda`                                                                                                                            | 型ガードなど一般的な小物（`isPlainObject` / `isObjectType`）                                                                                                               |
| runtime | `mermaid` `chart.js` `highlight.js`                                                                                                 | ブラウザへそのまま配る外部ライブラリ（`docs/architecture/browser.md`「重いライブラリ」）                                                                                   |
| runtime | `@fontsource/ibm-plex-mono`                                                                                                         | レポートのコードの書体（`/vendor/` から配る woff2）。承認済み                                                                                                              |
| runtime | `mdast-util-find-and-replace` `unist-util-visit`                                                                                    | Markdown の木を辿って書き換える                                                                                                                                            |
| runtime | `zustand`                                                                                                                           | 画面全体で共有する状態（`docs/architecture/browser.md`）                                                                                                                   |
| runtime | `@orpc/client` `@orpc/contract` `@orpc/server` `@orpc/tanstack-query` `@tanstack/react-query`                                       | サーバとブラウザの間の手続きと、その結果の取得                                                                                                                             |
| runtime | `@codemirror/commands` `@codemirror/lang-markdown` `@codemirror/language` `@codemirror/state` `@codemirror/view` `@lezer/highlight` | 入力欄のエディタ                                                                                                                                                           |
| runtime | `@a2ui/react` `@a2ui/web_core`                                                                                                      | `report` を A2UI のカタログで描く。入れ子で zod 3 が入る。`@a2ui/react` だけを `.pnpmfile.cjs` の `readPackage` で zod 3 に紐付ける。`src/shared/` は `@a2ui/*` を読めない |
| runtime | `clsx` `lucide-react`                                                                                                               | class 名の組み立てとアイコン                                                                                                                                               |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react`                                                              | 型とテスト                                                                                                                                                                 |
| dev     | `typescript` `@types/node` `@types/hast` `@types/mdast`                                                                             | 型検査と、その型定義                                                                                                                                                       |
| dev     | `oxlint` `oxfmt`                                                                                                                    | lint と整形                                                                                                                                                                |
| dev     | `dependency-cruiser`                                                                                                                | 層と機能の辺の検査（`.dependency-cruiser.cjs`）                                                                                                                            |
| dev     | `@swc/core`                                                                                                                         | dependency-cruiser が TypeScript 7 を読めないための構文の読み手                                                                                                            |
| dev     | `happy-css-modules` `postcss`                                                                                                       | CSS Modules の型の生成                                                                                                                                                     |
| dev     | `playwright-core`                                                                                                                   | 画面の確認（`scripts/capture/capture-*.ts`）と E2E（`docs/architecture/testing.md`）                                                                                       |
| dev     | `happy-dom`                                                                                                                         | `browser` のテストの DOM（`vitest.config.ts` の `dom`）。サーバの mermaid 構文検査の worker をやめたので runtime から dev へ移した                                         |
| dev     | `vitest` `vite`                                                                                                                     | テストランナーとブラウザ側の組み立て・開発サーバ                                                                                                                           |
| dev     | `@vitejs/plugin-react` `oxc-transform-react`                                                                                        | JSX の変換と React Compiler（`docs/coding-standards.md`「手でメモ化しない」）。承認済み                                                                                    |
| dev     | `@vitest/coverage-v8`                                                                                                               | 単体テストのカバレッジ（`pnpm run test:coverage`。`check` には入れない）。承認済み                                                                                         |
| dev     | `@stryker-mutator/core` `@stryker-mutator/vitest-runner`                                                                            | `src/shared/` の mutation score（`docs/research/mutation-score.md`。手元で月 1 回）                                                                                        |

`.pnpmfile.cjs` は `@a2ui/react` の peer の zod を外し、`@a2ui/react` の dependencies の zod 3 を読ませる（root の zod 4 に解決されると `@a2ui/web_core` の型と合わない）。pnpm は peer をレジストリ上の写しで解くので、`patchedDependencies` や `overrides` では紐付かない。tsukumo の側は zod 3 を import せず、A2UI のカタログを JSON Schema で書いて `Catalog.fromJson` で読ませる。

`zod` と `@anthropic-ai/claude-agent-sdk` はある。`ws` を選ぶのは**ランタイム固有の API に寄せない**ため。
**`playwright-core` は Playwright 同梱の `chromium-headless-shell`（`pnpm exec playwright-core install chromium-headless-shell` で入れる）を動かし、製品版の Google Chrome は鍵をキーチェーンへ溜めるので使わず**、テストランナー（`@playwright/test`）は足さない。

### 足す外部コマンド

**足す外部コマンド**（パッケージではなく OS のもの。**ユーザーの承認済み**）: `rtk`（Rust Token Killer。Homebrew。承認済み・試験導入）は、Bash の出力を縮めたコマンドへの書き換えを
`rtk rewrite` に頼む（`src/server/session-driver/adapter/rtk-rewrite.ts`。`PreToolUse` フックが
`updatedInput` で `command` を差し替える）。**無い・失敗・2秒を超えたときは元のコマンドを通す**ので、無くても動く。
有無はセッションの駆動を作るときに `rtk --version` で1回だけ確かめ、無ければ Bash ごとには起こさない。
`rtk init -g` は打たない（`~/.claude/settings.json` を書き換えるため）。
