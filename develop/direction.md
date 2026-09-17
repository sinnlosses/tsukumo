# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## 2026-09-17 自動 working をやめ、working を speak で選ぶ表情に戻す

- ツール実行中に自動で `working` の表情へ上書きするのをやめたい。`working` の表情は好きなので、
  場面に合えば `speak` で選ぶ対象としては残してほしい
- 原則: **表情と吹き出しはリンクしていること**（吹き出しが出ているときに表情が別のものになる
  ことはない）。自動の上書きは、この原則を壊す唯一の経路になっている

### 決めた理由（会話で確認した事実）

- 自動 working の根拠は `docs/requirements.md` 4.3 の「引数が来ないあいだも顔が止まらない
  ようにするため」の1点だけで、旧 hook 方式の対応表（`PreToolUse` = 作業中）の流用。
  **要件ではなく保険**
- その保険の前提は 2026-09-16 の `src/core/speech-cadence.ts`（1ターン5〜10回・ツールを
  走らせる前に1回）で既に解消済み
- 作業中を伝える経路は他に2本あり、どちらも自動 working に依存していない:
  サイドバー「いま何をしているか」（`runningTools` 由来）と立ち絵の動き `waiting`
  （`turnInProgress` 由来。`portrait-walk` が無限ループ）
- `working` を `speak` で選ぶ場面（tsukumo パックのラベルは「本気」）は、直後にツールを
  走らせる瞬間とほぼ重なる。自動の上書きが勝つので、選んでも画面では区別できていなかった

### 消えるもの（自動 working にぶら下がっていた部品）

- `src/protocol/expression.ts`: `resolveExpression` の working 分岐（＝関数が恒等になる）、
  `WORKING_EXPRESSION_DELAY_MS`、`WORKING_EXPRESSION_COOLDOWN_MS`、`isToolImmediatelyWorking`、
  `nextWorkingTransitionDelayMs`、`RunningToolTiming`
- `src/protocol/session-state.ts`: `lastToolFinishedAt` と、`finishTool` の `wasWorking` 判定
- `src/ui/features/character-view/character-view.tsx`: `nextWorkingTransitionDelayMs` で
  自分を配り直す `useEffect` タイマー
- **作業中の吹き出し（T-173、2026-09-17）ごと消える**。表示の条件が `expression === "working"`
  で表情にぶら下がっているため。`workingSpeech` は `character.json` 3パックと
  `src/protocol/character.ts`（`CharacterInfo` / `CharacterDefinition` / パース）と
  `balloon-track.tsx` の prop から消える。**画面の編集項目には出ていない**ので UI の削除は不要

### 一緒に決めるもの

- `REQUIRED_EXPRESSIONS` から `working` を外すか。必須だった根拠は「コードが名前で直接参照する」
  ことだけで、それが消える。外すと `working` は `proud` / `flustered` と同じ「あれば使う」
  扱いになり、キャラクター作成画面で立ち絵2枚を要求している所（`character-create.tsx`）も
  1枚になる。**外すのを推奨**
- パック定義の `expressions.working` のラベル。`working` が感情に戻るので、`tsukumo` の
  「本気」はそのままでよいが、`tsukumo-spirit` と `local` の「作業中」は状態の名前なので
  合わなくなる

### タスクにしないと決めたこと

- **「発話（吹き出し＋表情）を並びの単位にする」書き換えは行わない。** `SessionState.speeches`
  （`readonly string[]` + 1つの `speechExpression`）はそのまま残す。自動の上書きが消えると
  表情の源が `speak` の1つだけになり、**源が一意であることでリンクが保たれる**ため。
  残る食い違いはマーカー行の受け皿（`settleUtterance`）で拾ったセリフが直前の表情を引き継ぐ
  1点だけで、実装5ファイル・テスト6ファイルの書き換えに見合わないと判断した（2026-09-17、
  ユーザーは「必要ならどうぞ」と判断を委ねた）
