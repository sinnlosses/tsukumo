# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- `src/server` のうち `session-driver`・`session`・`view-server` のコメントを、`docs/coding-standards.md`「コメント」の新しい基準（無いと明らかに不都合を招くことだけ）で見直す。T-709 は指し方だけを揃えたので、規約への参照（`docs/coding-standards.md「エラーハンドリング」`・「会話内容の扱い」を添えるだけのもの）、用語の出典、「{@link relayCommandDescriptions} と同じ形」のような照らし合わせ、名前の由来の段落が残っている。古いディレクトリのパス（`src/server/adapter/`）も1件ある。量はコメント行およそ 2480。完了条件は T-710 と同じ形（backlog の条件を除き、glossary の grep が0件と規約の参照の一覧をつける）。依存は T-729、difficulty は opus（T-729 で範囲を割った）
- `src/server` の残り（上の3つ以外の機能と `core`・`adapter`。コメント行およそ 3030）を、同じ基準・同じ完了条件で見直す。依存は T-729、difficulty は opus（T-729 で範囲を割った）
- `src/browser` のうち `components/page` の外（`components/app`・`domain`・`ui`、`domain`・`features`・`hooks`・`lib`・`stores`・`types`・`utils`、`app.tsx`・`main.tsx`。コメント行およそ 1830 と CSS のコメントおよそ 250、backlog に載っているのは 111 ファイル）を、T-710 と同じ本文で見直す。完了条件の backlog は「`src/browser/` で始まるファイルがすべて消えている」（T-710 と合わせて）。依存は T-729、difficulty は opus（T-729 で T-710 を `components/page` に絞った溢れ分）
- `comment-audit` スキル（claude-skills の別の作業ツリーで）を `docs/coding-standards.md`「コメント」の新しい基準に揃える: 冒頭に判定の1問を置く、判定表 #6「消して、節への参照だけ残す」を「消す。参照も置かない」に変える、「規約・方針に従っていることとその参照 → 消す」「用語の出典 → 消す」を足す、#10（残す）にファイルの責務・外から使うものの契約・規約の例外を足す、「残すときの指し方」に節参照は残す制約の理由の置き場としてだけ添えると書く（T-729）

- **E2E「ターンの履歴 > 複数のやり取りが札として積み上がり、長い依頼の1行目は省略される」が `bun run check` の中でときどき落ちるのを直すタスクを足す**（振り返り: T-737）
  - 根拠: ドキュメントだけの差分の受け入れで `bun run check` を3回打ち、2回目にこの E2E が1件落ちて（23 pass / 1 fail）、3回目は通った（24 pass）。1回目は単体テストが1件落ち、単体だけ流し直すと通った。既存の揺れのタスク（`character-edit.test.tsx` と「⌘Enter で送ると prompt が流れ…」）はこの E2E を扱っていない
  - 出し先: `test/e2e/turn-history.test.ts` の揺れを直すタスク（sonnet）

- **CSS Modules の型の生成を `happy-css-modules` から css-modules-kit へ移す**（調査: `docs/research/css-modules-kit.md`）
  - 根拠: `happy-css-modules` の README が css-modules-kit を後継と明言し、最終 push は 2026-07-02 で止まっている。どちらも生成ファイルと `rootDirs` の仕組みで、移す手間は小さい
  - 出し先: 実装タスク1件（sonnet。依存の入れ替えを含むので着手前にユーザーの承認が要る）。`@css-modules-kit/codegen` に入れ替え、`tsconfig.json` の `cmkOptions`・`rootDirs`・`include`（`*.module.css` を含める）と `package.json` の `css-types` を直し、`docs/design.md` の `styles["..."]` の型の記述を追随させる。最初に `cmk` が Bun から動くかを確かめる。Vite への移行とは依存しないので、どちらを先にしてもよい
