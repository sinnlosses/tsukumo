# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### メインビューの「タブを切り替えたら先頭から読ませる」が効いていない（T-189 の目視中に発見）

`main-view.tsx` は `scrollerRef` を `.main-turns` に付けて `scrollTop = 0` にしているが、
`.main-turns` は `src/ui/styles/main-view.css` で `display:flex; flex-direction:column` を
持つだけで **overflow を持たない**。実際にスクロールしているのは親の
`.layout-region.layout-main`（`src/ui/styles/layout.css` の `overflow-y:auto`）。

実測（偽の駆動、1200x520、ターン3件）: `.main-turns` は `overflowY: visible` で
`scrollHeight === clientHeight`、親の region は `overflowY: auto` で
`scrollHeight 304 > clientHeight 275`。つまり `scrollTop = 0` は無害な no-op になっている。

**T-189 による退行ではない**（今回 CSS もスクロール対象も変えていない）。直すなら
(a) `.main-turns` に overflow を持たせる (b) スクロール対象を親の region に変える の
どちらかで、どちらもレイアウトの見え方に影響するので判断が要る。

### `src/` の置き場所の名前を「どこで動くか」と「何が住むか」に揃える（T-194 の提案。要 採否）

提案書は `docs/research/architecture-placement.md`（2026-09-16 の
`docs/research/architecture-proposal.md` は上書きしていない）。**層の切り方は正しいので変えない。
合っていないのは名前だけ**、というのが結論。

推す案（候補 C）:

| いま                                                      | 新                                                       |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `protocol`                                                | `src/shared/`                                            |
| `core`                                                    | `src/server/core/`                                       |
| `adapter`                                                 | `src/server/adapter/`                                    |
| `ui`                                                      | `src/browser/`                                           |
| `ui/features/layout` `ui/features/character-screen`       | `browser/screen/conversation` `browser/screen/character` |
| `ui/features/{main-view,character-view,sidebar,dispatch}` | `browser/region/<同名>`                                  |

- **依存の辺は1本も変えない。** `core → adapter` 禁止も領域どうしの import 禁止もそのまま
  `test/architecture.test.ts` が落とす（`layerOf` が2段を読めるようになるだけ）
- **`features/` という名前は木から消える。** 中身は画面・領域・provider の3種類が混ざっていて、
  bullet-proof-react の言う「機能のパッケージ」にあたるものは `stores/` のほうに居る。
  `screen` / `region` はどちらも用語集にある語（`data-region` 属性が既にコードにある）
- **素案の `lib/` `utils/` は採らない。** サーバ側に「外に触らずドメインも知らない」ファイルは
  実測 0 件（`tsukumo-home.ts` も `bundled-path.ts` も `node:` に触るので境界）。
  helm-yadokari の `utils/fs.ts` にあたるものは tsukumo では `adapter` に入るので、
  `utils/` を足すと基準が1ファイルで食い違う。`server/lib/` は実体が2つ出たら作る

段階（各段は単独で `bun run check` が通る）:

1. **ファイルを動かさない。** `README.md` のツリーが 2026-09-16 の `adapter/` 分割前のままなので
   実態へ直し、`docs/architecture.md` の置き場の表に「実行場所」列を足す（2〜3ファイル）
2. `protocol` → `shared`、`ui` → `browser`（移動 111）。**ここで止めても一貫した形になる**
3. `core` / `adapter` → `server/` の下へ（移動 43）
4. `browser/features/` を `screen/` と `region/` に割る（移動 63。目視確認が要る）

`CLAUDE.md` は原則2（層の名前）・原則3（`src/server/adapter/`）・原則5（例外の一覧から
`features/` が落ちる）の3つだけ直す。**この提案の段階では `CLAUDE.md` を直していない。**

決めてほしいこと: (a) `server`/`browser` か `backend`/`frontend` か、(b) 段3（`server/` への
入れ子）まで行くか段2で止めるか、(c) 会話画面の組み立てを `main.tsx` から `screen/` へ下ろすか。
