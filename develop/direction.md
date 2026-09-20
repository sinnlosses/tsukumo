# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### UI をカタログで見る仕組み（提案書: `docs/research/ui-catalog.md`。2026-09-21）

**推奨は「`capture-catalog.ts` に撮る前の操作を持たせ、台本の見本を厚くする」。Storybook は採らない。**

実測で分かったこと:

- `notation` の場面は `[data-region="main"]` が clientHeight 503 / scrollHeight 1358 で、
  **855px（63%）が1枚に入らない**。mermaid の図（top 567.86）と chart.js のグラフ（top 863.11）は
  **一度も撮れていない**。`fullPage` は効かない（ページ自体はスクロールせず、領域の内側がスクロールする）
- 記法は `notation.tsx` が12の class を解決するのに、台本が出すのは4つだけ。
  `note` / `note-ng` / `note-favor` / `badge-warn` / `badge-ng` / `stats` / `stat` の7つは未描画
- タスク一覧のモーダル・`/` の補完・`@` の補完・キャラクター画面・作る画面は一度も撮られていない
- **上のすべてが Playwright の4操作（領域内スクロール・押す・打つ・`location.hash`）で撮れることを確認済み**
- Storybook は直接3つ（`storybook` / `@storybook/react-vite` / `vite`）＋推移で新規126
  （optional 込み222）パッケージ。いまの368に対し +34%〜+60%。加えて Vite が焼く CSS Modules の
  class 名は `bun build` のものと別の綴りになるため、カタログの絵が実際に配る成果物でなくなる
  （`docs/design.md` 11章「Vite は足していない」を覆すことにもなる）

足すタスク（提案書6章が形の目安）:

- `scripts/capture-catalog.ts` の `CatalogEntry` に「撮る前に当てる操作」（判別可能な合併型で4種）を足し、
  いま撮れていない6件を `CATALOG` に足す
- `test/fixture/fake-session.json` の `notation` に、描かれていない7つの class を書き足す
- `docs/architecture.md`「手で確かめること」に、操作を当ててから撮ることと、
  撮った画像に実データのタスク一覧が写ることを足す。`capture-view.ts` のコメントに
  「class セレクタで測るときは `[class*="…"]`」を1行残す
- （保留）部品を並べる `#catalog` の画面を自前で作る案は、上を当てたあとで
  「部品を1つずつ並べて見たい」が実際に困りごとになったときに着手する
