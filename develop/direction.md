# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`as` の型アサーション（テストの `as HTML*Element` を含む）を lint で落とし、`instanceof` の型ガードや型引数へ寄せる**（振り返り: T-626, T-629）
  - 根拠: T-626 で新しく書いた `character-switch.test.tsx` に `as HTMLSelectElement` が入り、受け入れでメインが `instanceof` のガードに直した。隣の `session-switch.test.tsx` と `session-info.test.tsx` にも同じキャストが残っていて（`test/` 全体で74か所）、手本にされやすい（規約「型を迂回するキャストを書かない」はいまは機械で守られていない）
  - 根拠（2件目）: T-629 で `scripts/task-mention.ts` の `reduce` の初期値に `[] as string[]` が入り、受け入れでメインが型引数に直した
  - 出し先: `.oxlintrc.json` で型アサーションを落とす規則を足すタスク（既存の `test/` の該当箇所の置き換えを含む）
