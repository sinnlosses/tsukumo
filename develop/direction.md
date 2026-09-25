# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`character-edit.test.tsx` の「立ち絵を選ぶと data URL を載せた set-portrait を dispatch し、入力欄を空に戻す」が `bun run check` の全体実行でときどき落ちる揺れを直すタスクを足す**（振り返り: T-656）
  - 根拠: T-656 の受け入れで `bun run check` が 2711 pass / 1 fail（`character-edit.test.tsx:295`）。差分は docs とテストのコメントだけで、同じファイルを単独で5回回すと 45 pass / 0 fail、全体の打ち直しで 2712 pass / 0 fail。委譲先も同じターンに名前を控えられない1件の落ちを見ている。並べた作業ツリーの負荷で時間に依る待ちが切れている見込み（確かめていない）
  - 出し先: 揺れの原因（待ちの時間切れか、`FileReader` の非同期か）を突き止めて直すタスク。T-632（`--isolate` が終わらない）とは別件
