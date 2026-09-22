# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **起こし直さないと変わらないものを確かめる作法を `docs/workflow.md`「起こすときの作法」に足す**（振り返り: T-302）
  - 根拠: T-302 の完了条件「`speak` の enum に `bored` が入っている」は、enum が**セッション起動時**に
    `expressionChoices(pack.definition)` から組まれるため、動いているセッション自身では確かめられない
    （実測: 定義ファイルを直したあとに `zzz-not-a-face` を投げても候補は8件のまま）。さらに別インスタンスを
    既定のまま起こすと**同じ作業ツリーの直近セッションを resume する**ので、`TSUKUMO_NEW_SESSION=1` が要る
  - 出し先: `docs/workflow.md`「起こすときの作法」に、`TSUKUMO_VIEW_PORT` と並べて
    `TSUKUMO_NEW_SESSION=1` を足し、「起動時に作られるもの（`speak` の enum・パックの読み込み）は
    起こし直さないと変わらない」を1行で書く

- **「触らない」と書く資源は、完了条件の確認手順と突き合わせてから書く**（振り返り: T-302）
  - 根拠: T-302 の `## 注意` は「`~/.tsukumo/state.json` には触らない」だったが、完了条件
    「`characters/local` に切り替えても壊れない」を確かめると画面のパック切り替えが state.json を書き換える
    （実測: `{"character":"tsukumo"}` → `local`。確認後に画面から戻して復旧した）。禁止と手順が矛盾していた
  - 出し先: `docs/workflow.md`「タスクを書くとき・受け入れるとき」に、**確認手順が触る資源は
    「触らない」ではなく「確認後に元の値へ戻す」と書く**を足す

- **語彙を1つ増やす変更は、型検査が挙げない「件数に依存したテスト」を疑う**（振り返り: T-302）
  - 根拠: `EXPRESSIONS` に `bored` を足したとき、型検査が挙げた漏れ（`character-definition.ts` /
    `character.ts` / フィクスチャ16ファイル）を全部埋めてもテストが1件落ちた
    （`character-edit.test.tsx` の立ち絵の無い枠の期待値 5→6）。タスク本文の「やること2」は
    `bun run typecheck` の漏れだけを指していて、この1件は `bun test` で初めて出た
  - 出し先: `docs/coding-standards.md`「テスト」節に、**語彙（`EXPRESSIONS` など）の長さに
    依存する期待値をテストに直書きするなら、語彙を増やす側から見つかる形にする**（定数から導く、
    またはタスクの書き方として「typecheck のあとに必ず test も見る」）を足す
