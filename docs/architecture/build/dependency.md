# ビルドと依存: 足す依存

ステータス: **正典**。入口は `docs/architecture/build.md`（ビルドと依存の全体）。

責務: 足す依存の一覧（承認済み）と、足す外部コマンド。
読む時: 依存・外部コマンドを足すとき。
直す時: 依存の一覧や、足す外部コマンドを変えたとき。

## 節の索引

| 節              | 中身                             |
| --------------- | -------------------------------- |
| ## ビルドと依存 | 足す依存の一覧、足す外部コマンド |

## ビルドと依存

### 足す依存

**足す依存**（**ユーザーの承認済み**。ここに無いものを足すときは改めて承認を得る。承認の日付は
`docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）:

| 種別    | パッケージ                                                                                                                          | 用途                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| runtime | `react` `react-dom`                                                                                                                 | browser                                                                                                                                                |
| runtime | `ws`                                                                                                                                | core の WebSocket サーバ                                                                                                                               |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`                                                     | Markdown                                                                                                                                               |
| runtime | `remark-cjk-friendly`                                                                                                               | CJK の強調（`**「…」**`）                                                                                                                              |
| runtime | `unified`                                                                                                                           | サーバで Markdown を構文木にする口（質問の preview の画像を拾う）。2026-10-05 承認（利用者決定）                                                       |
| runtime | `remark-parse`                                                                                                                      | サーバで Markdown を読む段（`react-markdown` と同じ版）。2026-10-05 承認（利用者決定）                                                                 |
| runtime | `remeda`                                                                                                                            | 型ガードなど一般的な小物（`isPlainObject` / `isObjectType`）                                                                                           |
| runtime | `mermaid` `chart.js` `highlight.js`                                                                                                 | ブラウザへそのまま配る外部ライブラリ（`docs/architecture/browser.md`「重いライブラリ」）                                                               |
| runtime | `@fontsource/ibm-plex-mono`                                                                                                         | レポートのコードの書体（`/vendor/` から配る woff2）。2026-10-02 承認                                                                                   |
| runtime | `mdast-util-find-and-replace` `unist-util-visit`                                                                                    | Markdown の木を辿って書き換える                                                                                                                        |
| runtime | `zustand`                                                                                                                           | 画面全体で共有する状態（`docs/architecture/browser.md`）                                                                                               |
| runtime | `@orpc/client` `@orpc/contract` `@orpc/server` `@orpc/tanstack-query` `@tanstack/react-query`                                       | サーバとブラウザの間の手続きと、その結果の取得                                                                                                         |
| runtime | `@codemirror/commands` `@codemirror/lang-markdown` `@codemirror/language` `@codemirror/state` `@codemirror/view` `@lezer/highlight` | 入力欄のエディタ                                                                                                                                       |
| runtime | `happy-dom`                                                                                                                         | `report` の `mermaid` の塊を構文検査する worker が `window` として被せる（本体の大域は汚さない）。テストの DOM にも使う。2026-10-10 承認（利用者決定） |
| runtime | `clsx` `lucide-react`                                                                                                               | class 名の組み立てとアイコン                                                                                                                           |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react`                                                              | 型とテスト                                                                                                                                             |
| dev     | `typescript` `@types/node` `@types/hast` `@types/mdast`                                                                             | 型検査と、その型定義                                                                                                                                   |
| dev     | `oxlint` `oxfmt`                                                                                                                    | lint と整形                                                                                                                                            |
| dev     | `happy-css-modules` `postcss`                                                                                                       | CSS Modules の型の生成                                                                                                                                 |
| dev     | `playwright-core`                                                                                                                   | 画面の確認（`scripts/capture/capture-*.ts`）と E2E（`docs/architecture/testing.md`）                                                                   |
| dev     | `vitest` `vite`                                                                                                                     | テストランナーとブラウザ側の組み立て・開発サーバ                                                                                                       |
| dev     | `@vitejs/plugin-react` `oxc-transform-react`                                                                                        | JSX の変換と React Compiler（`docs/coding-standards.md`「手でメモ化しない」）。2026-09-29 承認                                                         |
| dev     | `storybook` `@storybook/react-vite`                                                                                                 | 部品を props ごとに並べて見る（`pnpm run storybook`）                                                                                                  |
| dev     | `@vitest/coverage-v8`                                                                                                               | 単体テストのカバレッジ（`pnpm run test:coverage`。`check` には入れない）。2026-10-02 承認                                                              |

**Storybook は本体と同じ `vite.config.ts` を読む**（`.storybook/main.ts` の `viteConfigPath`。
`build` の節だけは Storybook が捨てる）。CSS Modules の class 名は Vite が CSS の中身と行から焼く
（置き場の root に依存しない）ので、`pnpm run build` の成果物と同じ綴りになる。部品が実行時に取りに
行く `/character/<pack>/<file>` は同梱の `characters/` を、`/vendor/<name>` は `readVendorAsset` の
対応表をそのまま Storybook の開発サーバが配る。型は `tsconfig.storybook.json` で別に見る——
Storybook の型定義（`react-docgen-typescript` ほか）が TypeScript 7 の型と噛み合わず、
ライブラリの `.d.ts` の検査を外す必要があるため（本体の `tsconfig.json` は外さない）。

`zod` と `@anthropic-ai/claude-agent-sdk` はある。`ws` を選ぶのは**ランタイム固有の API に寄せない**ため。
**`playwright-core` は Playwright 同梱の `chromium-headless-shell`（`pnpm exec playwright-core install chromium-headless-shell` で入れる）を動かし、製品版の Google Chrome は鍵をキーチェーンへ溜めるので使わず**、テストランナー（`@playwright/test`）は足さない。

### 足す外部コマンド

**足す外部コマンド**（パッケージではなく OS のもの。**ユーザーの承認済み**）: `taskpolicy`（macOS 標準。2026-10-17 承認）。
`pnpm run check` が段の子を QoS の clamp で起こすのに使い、無い環境では `nice` で起こす
（`scripts/dev/lib/stage-priority.ts`。掛ける範囲と測定は `docs/architecture/testing.md`「E2E の走らせ方」）。
`rtk`（Rust Token Killer。Homebrew。2026-10-18 承認・試験導入）は、Bash の出力を縮めたコマンドへの書き換えを
`rtk rewrite` に頼む（`src/server/session-driver/adapter/rtk-rewrite.ts`。`PreToolUse` フックが
`updatedInput` で `command` を差し替える）。**無い・失敗・2秒を超えたときは元のコマンドを通す**ので、無くても動く。
`rtk init -g` は打たない（`~/.claude/settings.json` を書き換えるため）。
