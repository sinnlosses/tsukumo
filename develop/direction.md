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
