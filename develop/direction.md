# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **`report` を「ターンを閉じるツール」にし、締めのセリフを `report` の引数へ移す**（調査: `docs/research/report-block.md` 13章。T-703）
  - 根拠: 実物（SDK 0.3.280・CLI 2.1.280）で、`_meta["claude/endTurn"]: true` を返すと assistant の発言を挟まずターンが閉じ、`isError` の結果では閉じずに打ち直せ、閉じたターンの transcript もいまの復元経路で読めた。`report` のあとに本文を書き足して Stop hook に差し戻される問題が起きなくなる
  - 出し先: 実装タスク1件（opus。`closing` の受け渡し・中間レポートの扱い・関所の縮め方の3つの判断を含む）。`reportTool` の handler（`src/server/session-driver/adapter/sdk-tool.ts`）で審査が通ったときだけ `_meta` を付ける。`report` に `closing: { text, expression }` を足して描いたあと吹き出しへ回し、`SPEAK_TOOL_DESCRIPTION` / `REPORT_TOOL_DESCRIPTION` と記法の文面を合わせる。中間レポートは `final` の欄を足すか、`report` は常に閉じて途中経過は `speak` に任せるかを決める。`ReportGate` と `stopHooks` の関所を外すか縮める（`stopHooks` の effort の読み取りは残す）。`_meta` は `getSessionMessages` の transcript には残らないので、閉じたかの判定は流れているイベントから行う
- **`next-task` の手順5の委譲の指示に、ドラフトを積むタスクではドラフトの形（見出し1行・`根拠`・`出し先`）で書くことを足す**（振り返り: T-703）
  - 根拠: T-703 の委譲先は `## やること` を書かず、ドラフトを見出しの無い長い1項目で積んだので、受け入れでメインが両方を書き直した。`## やること` は指示に入っていたが、ドラフトの形は指示に無かった
  - 出し先: `claude-skills` の `next-task` の手順5に1行足す（別の作業ツリーで。sonnet）
- **背景のサブエージェントが呼んだ `report` を、`ReportReview` の新しい事実の判定から外す**（振り返り: T-721）
  - 根拠: `report` の handler は呼び出し元を見分けられず、メイン側に新しい事実が無いと、サブエージェントの `report` にも `REPORT_NOTHING_NEW_REJECTION_TEXT`（「何も書かずに終えてよい」）が返る。画面は変わらないが、委譲先の最終報告が短くなる恐れがある（委譲先の報告で指摘、未実測）
  - 出し先: タスク（handler で呼び出し元を判別できるかを確かめ、できればサブエージェントの呼び出しは判定しない。できなければ `## 注意` に残す）
- **同梱パックの `persona.md` が指す正典のパスを `src/server/report/core/report-notation.ts` に直す**（振り返り: T-721）
  - 根拠: 「締めのセリフの言い方」などが `src/server/core/report-notation.ts` と書いているが、実物は `src/server/report/core/` の下（委譲先の報告で指摘）
  - 出し先: タスク（同梱パックの `persona.md` のパスを直す。ホーム側 `~/.tsukumo/characters/` は人が直す）
