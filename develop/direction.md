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

### 一緒に決めたこと（2026-09-17 の会話で確定）

- **`REQUIRED_EXPRESSIONS` から `working` を外す。** 必須だった根拠は「コードが名前で直接
  参照する」ことだけで、それが消える。必須は `default` だけになり、キャラクター作成画面
  （`src/ui/features/appearance/character-create.tsx`）と保存の境界
  （`src/adapter/character-edit.ts`）で立ち絵2枚を要求している所も1枚になる。
  **`characters/local` は既に `portraits` が `default` だけ**なので、実態に追いつく変更でもある
- **識別子を `working` から `thinking` へ改名する。** 自動の上書きが消えて「作業中」の意味が
  剥がれるため（`docs/glossary.md`「コード上の識別子も用語集に合わせる」）。連動するのは
  `src/protocol/expression.ts` の `Expression` / `EXPRESSIONS`、`character.json` 3パックの
  `expressions` と `portraits` のキー、立ち絵のファイル名（`tsukumo/working.png` →
  `thinking.png`、`tsukumo-spirit/working.svg` → `thinking.svg`）、`src/adapter/character-edit.ts`、
  `src/ui/features/appearance/`、テスト。**`characters/local` は立ち絵を持っていないので
  `character.json` のキーだけ**（gitignore 済みなのでコミットには乗らない）
- **ラベルは `tsukumo` が「ふむ」**（考えこむ）。立ち絵が顎に手を当てて画面を見る思案の絵で、
  「本気」（気合）の絵ではないため。4枚のうち唯一の「静」の絵で、`persona.md` の「たまに古い
  言い回しが顔を出す（「ふむ」）」とも一致する。`tsukumo-spirit` と `local` の「作業中」も
  同じ枠の感情の語に直す
- **`persona.md` に表情の選び分けを1行足す。** 出番を広げるにはラベルより「いつ選ぶか」を
  書くほうが効く（今は「迷ったら `default`」しか無く、実際ほぼ `default` になっている）。
  どの表情がどの場面かはキャラクターごとに違うので、置き場所はコードではなくパック側（原則4）。
  `tsukumo` の案: 調べる前・結果を突き合わせるとき・判断に迷うときは「ふむ」、うまくいったら
  「えへん」、外したら「あわわ」、それ以外は「にっと」

### タスクにしないと決めたこと

- **「発話（吹き出し＋表情）を並びの単位にする」書き換えは行わない。** `SessionState.speeches`
  （`readonly string[]` + 1つの `speechExpression`）はそのまま残す。自動の上書きが消えると
  表情の源が `speak` の1つだけになり、**源が一意であることでリンクが保たれる**ため。
  残る食い違いはマーカー行の受け皿（`settleUtterance`）で拾ったセリフが直前の表情を引き継ぐ
  1点だけで、実装5ファイル・テスト6ファイルの書き換えに見合わないと判断した（2026-09-17、
  ユーザーは「必要ならどうぞ」と判断を委ねた）
