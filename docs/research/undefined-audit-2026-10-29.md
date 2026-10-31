# `| undefined` の洗い出し（2026-10-29）

ステータス: 一次情報（数えた記録）。直す作業は領域ごとのドラフトで行い、この文書は規約を変えない。

問い: `docs/coding-standards/error-input-and-absent-value.md`「「無いかもしれない」値」の6つの場所に当たらない `| undefined` はどこに、どれだけあるか。

## 数え方

- 対象は `src/` と `scripts/` の `.ts`/`.tsx`（`.d.ts` を除く）の 1227 ファイル。`test/` は数えない。
- 構文木（`vite` の `parseSync`）で、`T | undefined` を含む合併型の型注釈を 1 つ 1 件として拾った。全 1166 件。文字列 `| undefined` の出現 1172 件のうちコメント行の 6 件を除いた数と一致する。
- 拾えなかった形: 合併型にならない単独の `undefined` 型（`Promise<undefined>` など）3 件、`?:`（`type-shape.test.ts` が縛るので対象外）、`T | void`・`T | null`、型注釈が無く推論で付く `undefined`（例2）。
- 機械で外した「6つに当たる」は 256 件。例1は `src/server/**/adapter/` の中（174 件。`unknown`・環境変数・SDK イベントを引数に取る関数はディレクトリ判定の外なので数えていない）、例3は `useState`・`useRef`・`createContext`・`create` の型引数と `CSSProperties` の拡張（31 件）、例4は `let` の初期値が `undefined` または無い宣言（50 件。あとからの代入は見ていない）、例5は省略できる・既定値つきの引数（1 件）。例6は `ui/` の中に該当が無く 0 件。
- 残り 910 件は、宣言の行と、必要なときは関数の署名・型の定義を読んで「消せる」か「本物」に分けた。呼び出し側の本文は一件ずつ追っていない。したがって「消せる」は「消せる見込み」で、ドラフトの段で呼び出し側を読んで確かめる。
- 仕分けの基準は規約の「消す手は判別可能な合併型か入口で畳むかの2つだけ」。
  - 消せる: 内側の関数が `T | undefined` を引数に受けていて、呼び出し側で分岐するか `??` で既定値にして畳める。または同時に `undefined` になる欄を状態ごとの合併型に分けられる。
  - 本物: 探索・解析の失敗を返す戻り値のように、畳む先が呼び出し側の分岐しか無く、合併型にしても別の状態が増えないもの。外の世界の値の写し。`undefined` 自体が指示の意味を持つもの。
- 「呼び出し側の数」は対象の関数名（またはプロパティを持つ型名）を `src/` と `scripts/` で grep した行数から、定義・import・コメントの行を除いた数。関数を値として渡す参照は数えないので 0 になることがある。25 を超えたものは「広い」と付けた。

## 結果

| 領域                          | 全件     | 6つに当たる | 要確認のうち消せる | 本物    |
| ----------------------------- | -------- | ----------- | ------------------ | ------- |
| `src/browser/components`      | 303      | 39          | 72                 | 192     |
| `src/server/session-driver`   | 102      | 29          | 9                  | 64      |
| `src/shared/character-pack`   | 70       | 0           | 5                  | 65      |
| `scripts/hook`                | 66       | 0           | 22                 | 44      |
| `scripts/capture`             | 62       | 2           | 14                 | 46      |
| `src/shared/report`           | 60       | 0           | 9                  | 51      |
| `src/server/character-pack`   | 45       | 36          | 0                  | 9       |
| `scripts/shared`              | 40       | 0           | 17                 | 23      |
| `src/browser/domain`          | 34       | 2           | 5                  | 27      |
| `src/server/view-server`      | 34       | 30          | 0                  | 4       |
| `src/shared/session`          | 30       | 0           | 2                  | 28      |
| `scripts/dev`                 | 28       | 1           | 11                 | 16      |
| `src/server/core`             | 25       | 0           | 1                  | 24      |
| `src/browser/features`        | 24       | 1           | 4                  | 19      |
| `src/server/chat`             | 24       | 14          | 3                  | 7       |
| `src/server/session`          | 20       | 9           | 1                  | 10      |
| `src/server/repository`       | 19       | 19          | 0                  | 0       |
| `src/server/report`           | 17       | 7           | 3                  | 7       |
| `src/server/adapter`          | 16       | 16          | 0                  | 0       |
| `src/server/item`             | 16       | 8           | 0                  | 8       |
| `src/server/usage`            | 15       | 9           | 0                  | 6       |
| `scripts/document`            | 13       | 1           | 2                  | 10      |
| `src/server/diary`            | 12       | 6           | 0                  | 6       |
| `src/browser/stores`          | 9        | 5           | 0                  | 4       |
| `src/wiring/(root)`           | 9        | 2           | 0                  | 7       |
| `src/(root)`                  | 8        | 0           | 1                  | 7       |
| `scripts/runtime`             | 7        | 0           | 0                  | 7       |
| `src/shared/session-driver`   | 7        | 0           | 0                  | 7       |
| `src/server/achievement`      | 6        | 5           | 0                  | 1       |
| `src/server/work-plan`        | 6        | 2           | 0                  | 4       |
| `src/shared/item`             | 5        | 0           | 0                  | 5       |
| `src/server/recommendation`   | 4        | 2           | 0                  | 2       |
| `src/server/welcome-greeting` | 4        | 2           | 1                  | 1       |
| `src/browser/lib`             | 3        | 3           | 0                  | 0       |
| `src/server/host`             | 3        | 3           | 0                  | 0       |
| `src/shared/repository`       | 3        | 0           | 0                  | 3       |
| `src/browser/utils`           | 2        | 0           | 0                  | 2       |
| `src/server/workflow-setting` | 2        | 0           | 0                  | 2       |
| `src/shared/achievement`      | 2        | 0           | 0                  | 2       |
| `src/shared/usage`            | 2        | 0           | 0                  | 2       |
| `src/shared/utils`            | 2        | 0           | 0                  | 2       |
| `src/browser/hooks`           | 1        | 1           | 0                  | 0       |
| `src/server/checkout`         | 1        | 1           | 0                  | 0       |
| `src/server/diagnostic`       | 1        | 1           | 0                  | 0       |
| `src/server/system-prompt`    | 1        | 0           | 1                  | 0       |
| `src/shared/(root)`           | 1        | 0           | 0                  | 1       |
| `src/shared/diagnostic`       | 1        | 0           | 1                  | 0       |
| `src/shared/diary`            | 1        | 0           | 0                  | 1       |
| **合計**                      | **1166** | **256**     | **184**            | **726** |

全件 = 6つに当たる + 消せる + 本物 は、領域ごとにも合計でも成り立つ（表を作った道具で突き合わせた）。

領域は `src/<層>/<機能>`、`scripts/` は下 1 階層。層の直下のファイルは `(root)`。

## 本物の理由

### 理由の種類と代表例

| 記号 | 理由                                                                                                    | 件  | 代表例                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 探索・解析・読み取りの失敗を単一の「無い」で返す戻り値                                                  | 373 | `browser/components/domain/sidebar/components/task-doing-count.tsx:10`・`browser/components/domain/sidebar/domain/plan-window.ts:25`・`browser/components/page/achievement/domain/written-time.ts:5`                                           |
| R2   | 環境変数・引数・状態ファイル・定義ファイル・SDK/外部 API など外の世界の値の写し、またはそれを受ける入口 | 173 | `browser/components/domain/portrait.tsx:41`・`browser/domain/appearance-color.ts:168`・`browser/features/task-board/domain/task-board-list-width.ts:15`                                                                                        |
| R3   | DOM 属性・描画の差し込みにそのまま渡す props（例6の趣旨だが `ui/` の外なので表の判定に当たらない）      | 22  | `browser/components/domain/portrait.tsx:30`・`browser/components/domain/screen-nav/components/screen-nav-settings-face-frame.tsx:13`・`browser/components/domain/screen-nav/components/session-switcher.tsx:281`                               |
| R4   | 持ち主が1つで、「まだ無い／選ばれていない」が1つの意味しか持たない値                                    | 107 | `browser/components/domain/character-face.tsx:13`・`browser/components/domain/portrait.tsx:28`・`browser/components/domain/screen-nav/hooks/use-screen-nav.ts:130`                                                                             |
| R5   | React・TanStack Query・DOM の外来シグネチャや入れ物（`RefObject` など）で型が決まっているもの           | 6   | `browser/components/page/achievement/hooks/use-achievement.ts:169`・`browser/components/page/conversation/components/dispatch/domain/prompt-image.ts:19`・`browser/components/page/conversation/components/dispatch/domain/prompt-image.ts:37` |
| R6   | 全域の対応表の「なし」（クラス名を付けない）が意味を持つ値                                              | 10  | `browser/components/ui/button/button.tsx:109`・`browser/components/ui/field/field.tsx:22`・`browser/components/ui/field/field.tsx:27`                                                                                                          |
| R7   | 位置を保つ配列の穴（読めなかった列を飛ばさず添字を揃える）                                              | 3   | `shared/report/timeline-scale.ts:26`・`shared/report/timeline-scale.ts:33`・`scripts/dev/lib/a2ui-write-trial.ts:346`                                                                                                                          |
| R8   | ループの終端・畳み込みの途中経過・蓄積値（例4に準ずる）                                                 | 11  | `browser/components/domain/screen-nav/hooks/use-screen-nav.ts:197`・`browser/components/page/achievement/hooks/use-diary-book.ts:383`・`browser/components/page/achievement/hooks/use-diary-book.ts:393`                                       |
| R9   | イベントを出さない場合を「無い」で表す口（呼び出し側は無ければ何もしない）                              | 14  | `current-character.ts:63`・`current-character.ts:69`・`current-character.ts:76`                                                                                                                                                                |
| R10  | `undefined` 自体が「止める・外す・準備なし」という指示の意味を持つ引数                                  | 7   | `browser/domain/reveal/brush-scroll.ts:42`・`browser/domain/reveal/brush-scroll.ts:85`・`browser/domain/reveal/brush-tip.ts:63`                                                                                                                |

### 領域ごとの理由

| 領域                          | 本物 | 理由の内訳                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/browser/components`      | 192  | R1 88（例 `browser/components/domain/sidebar/components/task-doing-count.tsx:10`）、R4 67（例 `browser/components/domain/character-face.tsx:13`）、R3 19（例 `browser/components/domain/portrait.tsx:30`）、R6 7（例 `browser/components/ui/button/button.tsx:109`）、R5 6（例 `browser/components/page/achievement/hooks/use-achievement.ts:169`）、R8 4（例 `browser/components/domain/screen-nav/hooks/use-screen-nav.ts:197`）、R2 1（例 `browser/components/domain/portrait.tsx:41`） |
| `src/server/session-driver`   | 64   | R1 42（例 `server/session-driver/core/aside-prompt.ts:18`）、R2 21（例 `server/session-driver/core/pending-answer.ts:37`）、R10 1（例 `server/session-driver/core/prompt-delay.ts:14`）                                                                                                                                                                                                                                                                                                    |
| `src/shared/character-pack`   | 65   | R2 45（例 `shared/character-pack/character-asset.ts:18`）、R1 20（例 `shared/character-pack/character-asset.ts:36`）                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts/hook`                | 44   | R1 38（例 `scripts/hook/bash-guard.ts:24`）、R2 3（例 `scripts/hook/lib/bash-hook-call.ts:8`）、R8 3（例 `scripts/hook/lib/shell-write-rule.ts:153`）                                                                                                                                                                                                                                                                                                                                      |
| `scripts/capture`             | 46   | R1 25（例 `scripts/capture/capture-catalog.ts:262`）、R2 21（例 `scripts/capture/capture-catalog.ts:82`）                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/report`           | 51   | R1 31（例 `shared/report/a2ui-report-outline.ts:82`）、R4 15（例 `shared/report/code-mark.ts:51`）、R8 2（例 `shared/report/graph-fold.ts:64`）、R7 2（例 `shared/report/timeline-scale.ts:26`）、R3 1（例 `shared/report/graph-fold-html.ts:43`）                                                                                                                                                                                                                                         |
| `src/server/character-pack`   | 9    | R2 4（例 `server/character-pack/core/character-generation.ts:41`）、R9 3（例 `server/character-pack/core/character-pack-command.ts:22`）、R1 2（例 `server/character-pack/core/character-generation.ts:76`）                                                                                                                                                                                                                                                                               |
| `scripts/shared`              | 23   | R1 15（例 `scripts/shared/ast-node.ts:8`）、R2 8（例 `scripts/shared/claude-environment.ts:16`）                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/browser/domain`          | 27   | R1 14（例 `browser/domain/effort-label.ts:45`）、R4 8（例 `browser/domain/appearance-color.ts:20`）、R10 4（例 `browser/domain/reveal/brush-scroll.ts:42`）、R2 1（例 `browser/domain/appearance-color.ts:168`）                                                                                                                                                                                                                                                                           |
| `src/server/view-server`      | 4    | R2 4（例 `server/view-server/core/connection-grant.ts:7`）                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/session`          | 28   | R2 20（例 `shared/session/main-view-shape.ts:296`）、R1 7（例 `shared/session/model-name.ts:27`）、R3 1（例 `shared/session/session-event-report.ts:77`）                                                                                                                                                                                                                                                                                                                                  |
| `scripts/dev`                 | 16   | R1 10（例 `scripts/dev/harness-replay.ts:48`）、R2 5（例 `scripts/dev/check.ts:357`）、R7 1（例 `scripts/dev/lib/a2ui-write-trial.ts:346`）                                                                                                                                                                                                                                                                                                                                                |
| `src/server/core`             | 24   | R2 16（例 `server/core/config.ts:111`）、R1 6（例 `server/core/config.ts:209`）、R9 2（例 `server/core/command-receiver.ts:21`）                                                                                                                                                                                                                                                                                                                                                           |
| `src/browser/features`        | 19   | R4 8（例 `browser/features/task-board/components/task-attribute.tsx:24`）、R1 4（例 `browser/features/current-work/domain/current-work-step.ts:105`）、R6 3（例 `browser/features/task-board/components/task-board-sort-choice.tsx:22`）、R2 3（例 `browser/features/task-board/domain/task-board-list-width.ts:15`）、R3 1（例 `browser/features/run-setting/components/run-setting-select.tsx:42`）                                                                                      |
| `src/server/chat`             | 7    | R1 6（例 `server/chat/core/chat-archive-entry.ts:19`）、R9 1（例 `server/chat/core/chat-command.ts:13`）                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/server/session`          | 10   | R1 8（例 `server/session/core/changed-file-line.ts:13`）、R8 1（例 `server/session/core/changed-file-line.ts:39`）、R10 1（例 `server/session/core/waiting-line-alarm.ts:9`）                                                                                                                                                                                                                                                                                                              |
| `src/server/report`           | 7    | R1 5（例 `server/report/core/a2ui-structure-fault.ts:253`）、R4 2（例 `server/report/core/a2ui-structure-fault.ts:175`）                                                                                                                                                                                                                                                                                                                                                                   |
| `src/server/item`             | 8    | R9 4（例 `server/item/core/item-command.ts:14`）、R1 4（例 `server/item/core/item-edit.ts:34`）                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/server/usage`            | 6    | R1 3（例 `server/usage/core/token-usage.ts:296`）、R4 2（例 `server/usage/core/token-usage.ts:63`）、R2 1（例 `server/usage/core/usage-review-runner.ts:45`）                                                                                                                                                                                                                                                                                                                              |
| `scripts/document`            | 10   | R1 8（例 `scripts/document/closing-bold.ts:95`）、R2 2（例 `scripts/document/section-reference.ts:35`）                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/server/diary`            | 6    | R2 3（例 `server/diary/core/diary-tool.ts:193`）、R1 2（例 `server/diary/core/diary-tool.ts:177`）、R4 1（例 `server/diary/core/diary-tool.ts:46`）                                                                                                                                                                                                                                                                                                                                        |
| `src/browser/stores`          | 4    | R4 2（例 `browser/stores/turn-selection.ts:21`）、R10 1（例 `browser/stores/session.ts:70`）、R1 1（例 `browser/stores/turn-selection.ts:54`）                                                                                                                                                                                                                                                                                                                                             |
| `src/wiring/(root)`           | 7    | R2 5（例 `wiring/session-launch.ts:206`）、R1 2（例 `wiring/diary.ts:44`）                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/(root)`                  | 7    | R9 4（例 `current-character.ts:63`）、R1 2（例 `cli.ts:90`）、R2 1（例 `main.ts:291`）                                                                                                                                                                                                                                                                                                                                                                                                     |
| `scripts/runtime`             | 7    | R1 4（例 `scripts/runtime/diagnostic.ts:86`）、R2 3（例 `scripts/runtime/diagnostic.ts:103`）                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/session-driver`   | 7    | R1 4（例 `shared/session-driver/prompt-image.ts:107`）、R2 3（例 `shared/session-driver/api-trouble.ts:36`）                                                                                                                                                                                                                                                                                                                                                                               |
| `src/server/achievement`      | 1    | R1 1（例 `server/achievement/core/done-task.ts:38`）                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/server/work-plan`        | 4    | R1 3（例 `server/work-plan/core/band-position.ts:41`）、R2 1（例 `server/work-plan/core/work-plan-gate.ts:54`）                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/item`             | 5    | R1 5（例 `shared/item/item.ts:39`）                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/server/recommendation`   | 2    | R1 2（例 `server/recommendation/core/recommendation.ts:86`）                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/server/welcome-greeting` | 1    | R8 1（例 `server/welcome-greeting/core/kept-welcome.ts:47`）                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/shared/repository`       | 3    | R4 2（例 `shared/repository/task-summary.ts:46`）、R1 1（例 `shared/repository/task-summary.ts:92`）                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/browser/utils`           | 2    | R1 2（例 `browser/utils/data-url.ts:5`）                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/server/workflow-setting` | 2    | R1 2（例 `server/workflow-setting/core/workflow-setting-reading.ts:179`）                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/achievement`      | 2    | R1 2（例 `shared/achievement/achievement.ts:168`）                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/usage`            | 2    | R2 2（例 `shared/usage/plan-usage.ts:13`）                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/utils`            | 2    | R1 2（例 `shared/utils/image-data-url.ts:25`）                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/shared/(root)`           | 1    | R1 1（例 `shared/frame.ts:99`）                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/diary`            | 1    | R1 1（例 `shared/diary/diary.ts:105`）                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 数えて分かったこと

- 本物 726 件のうち R1 が 373 件で約半分。戻り値と `Promise<…>` の型引数は、署名と関数名から「見つからない・読めない」を返す形かを見て R1 に入れた（本体は読んでいない）。この形は規約の6つの表に直接の行が無く、例2（TypeScript が生む `undefined`）に準ずるものとして書いてある。表に行を足すかどうかは、この文書の範囲の外。
- R3 は `className`・`title`・`blockedTitle` など DOM 属性に素通しする props で、例6と同じ性質なのに `src/browser/components/ui/` の外にあるため表の判定に当たらない。例6の範囲を `ui/` の外へ広げるかは別の判断になる。

### 呼び出し側を読んで本物に移した件

「消せる」と見立てた件のうち、呼び出し側を読んで本物と分かったもの。理由はどれも R4（持ち主が1つで、「まだ無い」が1つの意味しか持たない）。
成果の画面の3件は、持ち主がセッションの状態で、キャラクター定義が届く前という意味しか持たない。畳み先に当たる既定の `CharacterInfo` が無く、消すと `!`・`as` か存在しない既定値が要る。
発話ログ・雑談表示の3件は、`useCharacterClock` の `waitingDueAt` が「待ちの一言の期日が無い」、`useSpeechLog` の `pinnedSpeech` が「何も留めていない」、`advanceReveal` の `lastRevealAt` が「まだ吹き出しを出していない」を表す。
`Infinity`・`-Infinity` で畳むとタイマーが直ちに鳴り続ける、または状態の形が変わる。`pinnedSpeech` はビューモデルの欄を運ぶ props で、畳むと呼び出し側の型が名指しの外へ広がる。
入力欄の2件は、`draftOnSessionChange` の `previous`・`next` が「セッションが未確定」を表す。同じ `sessionId` を入力欄のフックの ref・effect の依存・下書きの保存と消去も使うので、引数だけを合併型にしても変換が両端に増えるだけで、全部を合併型にすると型が名指しの外へ広がる。

| ファイル                                                                                     | 対象                      | 置き場 | 行  | 理由 |
| -------------------------------------------------------------------------------------------- | ------------------------- | ------ | --- | ---- |
| `browser/components/page/achievement/domain/diary-writer.ts`                                 | `currentWriterPortraitOf` | 引数   | 34  | R4   |
| `browser/components/page/achievement/hooks/use-achievement.ts`                               | `reviewButtonOf`          | 引数   | 293 | R4   |
| `browser/components/page/achievement/hooks/use-diary-book.ts`                                | `pageOf`                  | 引数   | 254 | R4   |
| `browser/components/page/conversation/components/character-view/hooks/use-character-view.ts` | `useCharacterClock`       | 引数   | 304 | R4   |
| `browser/components/page/conversation/components/character-view/hooks/use-speech-log.ts`     | `useSpeechLog`            | 引数   | 83  | R4   |
| `browser/components/page/conversation/components/chat-view/hooks/use-speech-reveal.ts`       | `advanceReveal`           | 引数   | 110 | R4   |
| `browser/components/page/conversation/components/dispatch/domain/composer-draft-storage.ts`  | `draftOnSessionChange`    | 引数   | 44  | R4   |
| `browser/components/page/conversation/components/dispatch/domain/composer-draft-storage.ts`  | `draftOnSessionChange`    | 引数   | 45  | R4   |

## 消せるもの

領域ごとの対象。ドラフトはこの単位で割る。「入口で畳む」は、呼び出し側で分岐するか `??` で既定値にして、関数を必ずある値で受ける形にすること。「（広い）」は呼び出し側が 25 を超えるもので、ドラフトにする前に畳み方の優先を決める。

### `src/browser/components`（消せる 72 件）

| ファイル                                                                                      | 対象                       | 置き場 | 件  | 行                 | 消し方     | 呼び出し側の数 |
| --------------------------------------------------------------------------------------------- | -------------------------- | ------ | --- | ------------------ | ---------- | -------------- |
| `browser/components/domain/screen-nav/hooks/use-session-digest.ts`                            | `useSessionDigest`         | 引数   | 1   | 16                 | 入口で畳む | 3              |
| `browser/components/domain/sidebar/hooks/use-plan-usage.ts`                                   | `toState`                  | 引数   | 1   | 100                | 入口で畳む | 1              |
| `browser/components/domain/sidebar/hooks/use-plan-usage.ts`                                   | `toSource`                 | 引数   | 1   | 112                | 入口で畳む | 1              |
| `browser/components/domain/sidebar/hooks/use-sidebar-footer.ts`                               | `toPlanWindowPie`          | 引数   | 1   | 125                | 入口で畳む | 2              |
| `browser/components/domain/sidebar/hooks/use-sidebar-footer.ts`                               | `planGaugeLabel`           | 引数   | 1   | 163                | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-achievement.ts`                                | `bubbleOf`                 | 引数   | 2   | 254・255           | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-achievement.ts`                                | `isViewingToday`           | 引数   | 1   | 358                | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-achievement.ts`                                | `daySwitchOf`              | 引数   | 1   | 366                | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-achievement.ts`                                | `viewOf`                   | 引数   | 1   | 374                | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-diary-book-open-request.ts`                    | `takeDiaryBookOpenRequest` | 引数   | 1   | 28                 | 入口で畳む | 1              |
| `browser/components/page/achievement/hooks/use-diary-book.ts`                                 | `pageOf`                   | 引数   | 1   | 251                | 入口で畳む | 1              |
| `browser/components/page/character/components/character-create/hooks/use-character-create.ts` | `toGenerationProgress`     | 引数   | 1   | 275                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/character-view/domain/pinned-speech.ts`      | `isSpeechSelected`         | 引数   | 3   | 75・78・79         | 入口で畳む | 2              |
| `browser/components/page/conversation/components/character-view/hooks/use-character-view.ts`  | `balloonSpeeches`          | 引数   | 4   | 254・255・256・257 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/character-view/hooks/use-character-view.ts`  | `pastTurnSpeech`           | 引数   | 2   | 280・281           | 入口で畳む | 1              |
| `browser/components/page/conversation/components/character-view/hooks/use-speech-log.ts`      | `logEntries`               | 引数   | 2   | 112・113           | 入口で畳む | 1              |
| `browser/components/page/conversation/components/chat-view/hooks/use-chat-view.ts`            | `chatRows`                 | 引数   | 1   | 161                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/chat-view/hooks/use-chat-view.ts`            | `speechExpressionAt`       | 引数   | 1   | 242                | 入口で畳む | 2              |
| `browser/components/page/conversation/components/dispatch/hooks/use-composer.ts`              | `inquiryBandText`          | 引数   | 1   | 306                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/dispatch/hooks/use-composer.ts`              | `composerPlaceholder`      | 引数   | 1   | 318                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/dispatch/hooks/use-turn-status.ts`           | `sendLabel`                | 引数   | 1   | 183                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/hooks/use-speech-press.ts`                   | `isSelectionDrag`          | 引数   | 1   | 67                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/inquiry/hooks/use-inquiry-scroll.ts`         | `useInquiryScroll`         | 引数   | 1   | 19                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/a2ui-interactive-view.tsx`         | `nextSort`                 | 引数   | 1   | 125                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/domain/a2ui-table-view.ts`         | `visibleRowOrder`          | 引数   | 1   | 27                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/domain/a2ui-table-view.ts`         | `compareCells`             | 引数   | 2   | 50・50             | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/hooks/use-active-turn-scroll.ts`   | `targetOf`                 | 引数   | 1   | 98                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/hooks/use-work-strip.ts`           | `stripResultOf`            | 引数   | 1   | 317                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/main-view/mini-portrait.tsx`                 | `miniAltText`              | 引数   | 2   | 134・134           | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/chart-label-layout.ts`     | `barEndText`               | 引数   | 1   | 62                 | 入口で畳む | 4              |
| `browser/components/page/conversation/components/markdown/renderer/chart-palette.ts`          | `colorsForDataset`         | 引数   | 1   | 27                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/code-line-list.tsx`        | `diffSignLine`             | 引数   | 1   | 111                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/code-line-list.tsx`        | `diffWordLine`             | 引数   | 1   | 115                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/code-node.ts`              | `findCodeChild`            | 引数   | 1   | 20                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/color-swatch.ts`           | `inkOver`                  | 引数   | 1   | 120                | 入口で畳む | 2              |
| `browser/components/page/conversation/components/markdown/renderer/fence-figure.tsx`          | `isFenceFigureLanguage`    | 引数   | 1   | 24                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/folded-block.tsx`          | `tableColumnCount`         | 引数   | 1   | 48                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/folded-block.tsx`          | `isFootnoteList`           | 引数   | 1   | 56                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/notation.tsx`              | `withItemCountClass`       | 引数   | 2   | 151・152           | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/notation.tsx`              | `resolveNotationClassName` | 引数   | 1   | 171                | 入口で畳む | 7              |
| `browser/components/page/conversation/components/markdown/renderer/notation.tsx`              | `noteKind`                 | 引数   | 1   | 182                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/note-label.tsx`            | `noteLabelColorClass`      | 引数   | 1   | 28                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`          | `openZoom`                 | 引数   | 2   | 62・117            | 入口で畳む | 0              |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`          | `readCaption`              | 引数   | 1   | 312                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`          | `sameRegion`               | 引数   | 2   | 332・332           | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/shell-line.ts`             | `shellLineKinds`           | 引数   | 1   | 14                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/task-check.ts`             | `withClassName`            | 引数   | 1   | 84                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/theme-color.ts`            | `resolveHex`               | 引数   | 1   | 26                 | 入口で畳む | 3              |
| `browser/components/page/conversation/domain/welcome-entry-list.ts`                           | `previousSessionOf`        | 引数   | 1   | 44                 | 入口で畳む | 1              |
| `browser/components/page/conversation/domain/welcome-entry-list.ts`                           | `hasOtherSession`          | 引数   | 1   | 54                 | 入口で畳む | 1              |
| `browser/components/page/conversation/domain/welcome-entry-list.ts`                           | `welcomeCardsOf`           | 引数   | 2   | 62・63             | 入口で畳む | 1              |
| `browser/components/page/conversation/domain/welcome-entry-list.ts`                           | `resumeCards`              | 引数   | 2   | 91・92             | 入口で畳む | 1              |
| `browser/components/page/conversation/stores/inquiry-answer.ts`                               | `questionModel`            | 引数   | 1   | 203                | 入口で畳む | 1              |
| `browser/components/page/conversation/stores/inquiry-answer.ts`                               | `optionRows`               | 引数   | 1   | 342                | 入口で畳む | 1              |
| `browser/components/page/token-usage/hooks/use-usage-review.ts`                               | `stageViews`               | 引数   | 1   | 319                | 入口で畳む | 1              |
| `browser/components/page/token-usage/hooks/use-usage-review.ts`                               | `stageCount`               | 引数   | 1   | 333                | 入口で畳む | 1              |
| `browser/components/page/token-usage/hooks/use-usage-review.ts`                               | `useReviewStageSummary`    | 引数   | 1   | 360                | 入口で畳む | 1              |

### `scripts/hook`（消せる 22 件）

| ファイル                                   | 対象                           | 置き場 | 件  | 行       | 消し方     | 呼び出し側の数 |
| ------------------------------------------ | ------------------------------ | ------ | --- | -------- | ---------- | -------------- |
| `scripts/hook/lib/foreign-restore.ts`      | `createWorktreeProbe`          | 引数   | 1   | 61       | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `findDeniedBashRule`           | 引数   | 1   | 112      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `findDeniedCommandRule`        | 引数   | 1   | 125      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `writeRuleOf`                  | 引数   | 1   | 166      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `copiesIntoWorkTree`           | 引数   | 1   | 262      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `isDirectory`                  | 引数   | 1   | 295      | 入口で畳む | 8              |
| `scripts/hook/lib/shell-write-rule.ts`     | `nodeCodes`                    | 引数   | 1   | 327      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `readScriptAt`                 | 引数   | 1   | 353      | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `directoryAfter`               | 引数   | 1   | 362      | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `directoryAfterUnsure`         | 引数   | 1   | 383      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `locatePath`                   | 引数   | 1   | 388      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `startDirectory`               | 引数   | 1   | 407      | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `isDeniedPythonCode`           | 引数   | 1   | 412      | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `hasUnsafeWrite`               | 引数   | 1   | 420      | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `isLiteralOutsideWorkTree`     | 引数   | 1   | 430      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `readPythonScripts`            | 引数   | 2   | 449・450 | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `readScriptFile`               | 引数   | 1   | 506      | 入口で畳む | 1              |
| `scripts/hook/lib/shell-write-rule.ts`     | `absoluteScriptPath`           | 引数   | 1   | 511      | 入口で畳む | 3              |
| `scripts/hook/lib/shell-write-rule.ts`     | `isCommandBoundary`            | 引数   | 1   | 569      | 入口で畳む | 1              |
| `scripts/hook/lib/worktree-shell-write.ts` | `findWorktreeShellWriteDenial` | 引数   | 1   | 25       | 入口で畳む | 1              |
| `scripts/hook/lib/worktree-shell-write.ts` | `readWorkRoot`                 | 引数   | 1   | 32       | 入口で畳む | 1              |

### `scripts/shared`（消せる 17 件）

| ファイル                                    | 対象                | 置き場 | 件  | 行     | 消し方     | 呼び出し側の数 |
| ------------------------------------------- | ------------------- | ------ | --- | ------ | ---------- | -------------- |
| `scripts/shared/ast-node.ts`                | `literalString`     | 引数   | 1   | 19     | 入口で畳む | 4              |
| `scripts/shared/ast-node.ts`                | `objectField`       | 引数   | 1   | 33     | 入口で畳む | 36（広い）     |
| `scripts/shared/ast-node.ts`                | `stringField`       | 引数   | 1   | 38     | 入口で畳む | 56（広い）     |
| `scripts/shared/ast-node.ts`                | `arrayField`        | 引数   | 1   | 43     | 入口で畳む | 19             |
| `scripts/shared/changed-path-repository.ts` | `splitLines`        | 引数   | 1   | 20     | 入口で畳む | 3              |
| `scripts/shared/e2e-scenario.ts`            | `isTraceable`       | 引数   | 1   | 89     | 入口で畳む | 6              |
| `scripts/shared/e2e-scenario.ts`            | `isLiteralTable`    | 引数   | 1   | 169    | 入口で畳む | 6              |
| `scripts/shared/e2e-scenario.ts`            | `calleeName`        | 引数   | 1   | 247    | 入口で畳む | 1              |
| `scripts/shared/e2e-scenario.ts`            | `isIdentifierNamed` | 引数   | 1   | 283    | 入口で畳む | 1              |
| `scripts/shared/e2e-scenario.ts`            | `templateHead`      | 引数   | 1   | 287    | 入口で畳む | 1              |
| `scripts/shared/export-symbol.ts`           | `declaredNames`     | 引数   | 1   | 29     | 入口で畳む | 1              |
| `scripts/shared/export-symbol.ts`           | `symbolName`        | 引数   | 1   | 38     | 入口で畳む | 2              |
| `scripts/shared/instance-location.ts`       | `describeFreshness` | 引数   | 2   | 18・19 | 入口で畳む | 1              |
| `scripts/shared/module-reference.ts`        | `isImportMeta`      | 引数   | 1   | 62     | 入口で畳む | 2              |
| `scripts/shared/module-reference.ts`        | `isImportMetaGlob`  | 引数   | 1   | 77     | 入口で畳む | 1              |
| `scripts/shared/replay-prompt.ts`           | `buildReplayPrompt` | 引数   | 1   | 4      | 入口で畳む | 1              |

### `scripts/capture`（消せる 14 件）

| ファイル                                  | 対象                  | 置き場     | 件  | 行                 | 消し方                             | 呼び出し側の数 |
| ----------------------------------------- | --------------------- | ---------- | --- | ------------------ | ---------------------------------- | -------------- |
| `scripts/capture/lib/capture-source.ts`   | `Source`              | プロパティ | 3   | 12・14・16         | 合併型（URL か場面かで欄を分ける） | 4              |
| `scripts/capture/lib/capture-source.ts`   | `sourceOf`            | 引数       | 5   | 24・25・26・27・28 | 入口で畳む                         | 1              |
| `scripts/capture/lib/capture-stub.ts`     | `isStubbedCall`       | 引数       | 1   | 45                 | 入口で畳む                         | 1              |
| `scripts/capture/lib/catalog-setup.ts`    | `launchPlaceOf`       | 引数       | 1   | 47                 | 入口で畳む                         | 1              |
| `scripts/capture/lib/comparison-draft.ts` | `describeNumber`      | 引数       | 1   | 83                 | 入口で畳む                         | 1              |
| `scripts/capture/lib/scene-end.ts`        | `sceneEndTarget`      | 引数       | 1   | 26                 | 入口で畳む                         | 2              |
| `scripts/capture/lib/scene-end.ts`        | `sceneEventTimeoutMs` | 引数       | 1   | 73                 | 入口で畳む                         | 2              |
| `scripts/capture/lib/scene-end.ts`        | `countedSteps`        | 引数       | 1   | 161                | 入口で畳む                         | 2              |

### `scripts/dev`（消せる 11 件）

| ファイル                              | 対象               | 置き場     | 件  | 行         | 消し方                                   | 呼び出し側の数 |
| ------------------------------------- | ------------------ | ---------- | --- | ---------- | ---------------------------------------- | -------------- |
| `scripts/dev/a2ui-write-trial.ts`     | `resultOf`         | 引数       | 1   | 194        | 入口で畳む                               | 2              |
| `scripts/dev/harness-replay.ts`       | `readBrief`        | 引数       | 1   | 48         | 入口で畳む                               | 1              |
| `scripts/dev/lib/a2ui-write-trial.ts` | `CaseResult`       | プロパティ | 3   | 70・76・77 | 合併型（再試行した結果としなかった結果） | 5              |
| `scripts/dev/lib/a2ui-write-trial.ts` | `systemPromptFor`  | 引数       | 1   | 137        | 入口で畳む                               | 1              |
| `scripts/dev/lib/a2ui-write-trial.ts` | `judgeComponents`  | 引数       | 1   | 223        | 入口で畳む                               | 2              |
| `scripts/dev/lib/a2ui-write-trial.ts` | `average`          | 引数       | 1   | 346        | 入口で畳む                               | 2              |
| `scripts/dev/lib/a2ui-write-trial.ts` | `SummaryRow`       | プロパティ | 2   | 369・370   | 合併型（再試行の有無で欄を分ける）       | 1              |
| `scripts/dev/ship.ts`                 | `readCriteriaFile` | 引数       | 1   | 233        | 入口で畳む                               | 1              |

### `src/server/session-driver`（消せる 9 件）

| ファイル                                          | 対象                 | 置き場 | 件  | 行     | 消し方     | 呼び出し側の数 |
| ------------------------------------------------- | -------------------- | ------ | --- | ------ | ---------- | -------------- |
| `server/session-driver/core/body-figure-fence.ts` | `keyTypeOf`          | 引数   | 2   | 57・58 | 入口で畳む | 1              |
| `server/session-driver/core/body-figure-fence.ts` | `columnsOf`          | 引数   | 1   | 75     | 入口で畳む | 1              |
| `server/session-driver/core/body-figure-fence.ts` | `toNumber`           | 引数   | 1   | 109    | 入口で畳む | 4              |
| `server/session-driver/core/pending-answer.ts`    | `toPendingAsk`       | 引数   | 1   | 196    | 入口で畳む | 1              |
| `server/session-driver/core/plan.ts`              | `planName`           | 引数   | 1   | 27     | 入口で畳む | 1              |
| `server/session-driver/core/session-catalog.ts`   | `withSessionMark`    | 引数   | 1   | 148    | 入口で畳む | 1              |
| `server/session-driver/core/session-digest.ts`    | `clipped`            | 引数   | 1   | 91     | 入口で畳む | 2              |
| `server/session-driver/core/session-title.ts`     | `decideSessionTitle` | 引数   | 1   | 51     | 入口で畳む | 1              |

### `src/shared/report`（消せる 9 件）

| ファイル                                   | 対象                  | 置き場     | 件  | 行       | 消し方                               | 呼び出し側の数 |
| ------------------------------------------ | --------------------- | ---------- | --- | -------- | ------------------------------------ | -------------- |
| `shared/report/graph-source.ts`            | `toneToken`           | 引数       | 1   | 358      | 入口で畳む                           | 1              |
| `shared/report/report-diagram-markdown.ts` | `toneAttribute`       | 引数       | 1   | 403      | 入口で畳む                           | 2              |
| `shared/report/report-drawn-outline.ts`    | `drawnSection`        | 引数       | 1   | 108      | 入口で畳む                           | 3              |
| `shared/report/table-layout.ts`            | `isStatusCell`        | 引数       | 1   | 85       | 入口で畳む                           | 2              |
| `shared/report/table-view.ts`              | `tableRowFilterTexts` | 引数       | 1   | 25       | 入口で畳む                           | 2              |
| `shared/report/timeline-scale.ts`          | `PlacedValue`         | プロパティ | 2   | 169・170 | 合併型（読めた値と読めなかった理由） | 1              |
| `shared/report/timeline-scale.ts`          | `uniqueReasons`       | 引数       | 1   | 217      | 入口で畳む                           | 2              |
| `shared/report/timeline-scale.ts`          | `tickLabel`           | 引数       | 1   | 230      | 入口で畳む                           | 1              |

### `src/browser/domain`（消せる 5 件）

| ファイル                                | 対象                  | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| --------------------------------------- | --------------------- | ------ | --- | --- | ---------- | -------------- |
| `browser/domain/character-face.ts`      | `characterFaceInfo`   | 引数   | 1   | 11  | 入口で畳む | 6              |
| `browser/domain/effort-label.ts`        | `resolveEffortSelect` | 引数   | 1   | 77  | 入口で畳む | 2              |
| `browser/domain/model-label.ts`         | `resolveShownModel`   | 引数   | 1   | 44  | 入口で畳む | 1              |
| `browser/domain/portrait-appearance.ts` | `portraitAppearance`  | 引数   | 1   | 20  | 入口で畳む | 4              |
| `browser/domain/reveal/brush-tip.ts`    | `stanceOf`            | 引数   | 1   | 119 | 入口で畳む | 1              |

### `src/shared/character-pack`（消せる 5 件）

| ファイル                                     | 対象                     | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| -------------------------------------------- | ------------------------ | ------ | --- | --- | ---------- | -------------- |
| `shared/character-pack/character.ts`         | `shownCharacterPackName` | 引数   | 1   | 142 | 入口で畳む | 2              |
| `shared/character-pack/character.ts`         | `effectiveAccent`        | 引数   | 1   | 196 | 入口で畳む | 1              |
| `shared/character-pack/character.ts`         | `backgroundWithUrl`      | 引数   | 1   | 207 | 入口で畳む | 1              |
| `shared/character-pack/character.ts`         | `portraitUrls`           | 引数   | 1   | 220 | 入口で畳む | 1              |
| `shared/character-pack/expression-choice.ts` | `expressionChoices`      | 引数   | 1   | 21  | 入口で畳む | 8              |

### `src/browser/features`（消せる 4 件）

| ファイル                                                         | 対象                          | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ---------------------------------------------------------------- | ----------------------------- | ------ | --- | --- | ---------- | -------------- |
| `browser/features/current-work/hooks/use-current-work.ts`        | `toSummaryView`               | 引数   | 1   | 373 | 入口で畳む | 1              |
| `browser/features/current-work/hooks/use-current-work.ts`        | `toPendingHintView`           | 引数   | 1   | 435 | 入口で畳む | 1              |
| `browser/features/run-setting/components/run-setting-option.tsx` | `permissionModeSelectOptions` | 引数   | 1   | 122 | 入口で畳む | 2              |
| `browser/features/task-board/domain/task-board-content.ts`       | `boardContent`                | 引数   | 1   | 75  | 入口で畳む | 1              |

### `src/server/report`（消せる 3 件）

| ファイル                                     | 対象             | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| -------------------------------------------- | ---------------- | ------ | --- | --- | ---------- | -------------- |
| `server/report/core/a2ui-structure-fault.ts` | `referencesOf`   | 引数   | 1   | 192 | 入口で畳む | 1              |
| `server/report/core/a2ui-structure-fault.ts` | `placementFault` | 引数   | 1   | 251 | 入口で畳む | 1              |
| `server/report/core/a2ui-structure-fault.ts` | `isContainer`    | 引数   | 1   | 282 | 入口で畳む | 2              |

### `src/shared/session`（消せる 2 件）

| ファイル                             | 対象                   | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ------------------------------------ | ---------------------- | ------ | --- | --- | ---------- | -------------- |
| `shared/session/a2ui-report-view.ts` | `leafRegionOf`         | 引数   | 1   | 89  | 入口で畳む | 2              |
| `shared/session/work-plan.ts`        | `settleDelegatedRange` | 引数   | 1   | 309 | 入口で畳む | 1              |

### `scripts/document`（消せる 2 件）

| ファイル                                | 対象          | 置き場 | 件  | 行       | 消し方     | 呼び出し側の数 |
| --------------------------------------- | ------------- | ------ | --- | -------- | ---------- | -------------- |
| `scripts/document/section-reference.ts` | `toReference` | 引数   | 2   | 229・230 | 入口で畳む | 2              |

### `src/(root)`（消せる 1 件）

| ファイル               | 対象         | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ---------------------- | ------------ | ------ | --- | --- | ---------- | -------------- |
| `current-character.ts` | `serveAsset` | 引数   | 1   | 89  | 入口で畳む | 1              |

### `src/server/chat`（消せる 3 件）

| ファイル                                | 対象               | 置き場     | 件  | 行            | 消し方                                | 呼び出し側の数 |
| --------------------------------------- | ------------------ | ---------- | --- | ------------- | ------------------------------------- | -------------- |
| `server/chat/core/chat-archive-port.ts` | `ChatArchiveEntry` | プロパティ | 3   | 143・145・161 | 画像の欄を1つの配列に畳む（0 枚は空） | 3              |

### `src/server/core`（消せる 1 件）

| ファイル                          | 対象                        | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| --------------------------------- | --------------------------- | ------ | --- | --- | ---------- | -------------- |
| `server/core/structured-query.ts` | `structuredQuery の settle` | 引数   | 1   | 213 | 入口で畳む | 1              |

### `src/server/session`（消せる 1 件）

| ファイル                                | 対象                   | 置き場     | 件  | 行  | 消し方                                | 呼び出し側の数 |
| --------------------------------------- | ---------------------- | ---------- | --- | --- | ------------------------------------- | -------------- |
| `server/session/core/session-launch.ts` | `SessionLaunchRequest` | プロパティ | 1   | 45  | 入口で `boolean` に畳む（既定は仕事） | 6              |

### `src/server/system-prompt`（消せる 1 件）

| ファイル                                         | 対象                   | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ------------------------------------------------ | ---------------------- | ------ | --- | --- | ---------- | -------------- |
| `server/system-prompt/core/appearance-prompt.ts` | `appearancePromptPart` | 引数   | 1   | 13  | 入口で畳む | 1              |

### `src/server/welcome-greeting`（消せる 1 件）

| ファイル                                       | 対象          | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ---------------------------------------------- | ------------- | ------ | --- | --- | ---------- | -------------- |
| `server/welcome-greeting/core/welcome-line.ts` | `rejectionOf` | 引数   | 1   | 73  | 入口で畳む | 3              |

### `src/shared/diagnostic`（消せる 1 件）

| ファイル                                 | 対象                 | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ---------------------------------------- | -------------------- | ------ | --- | --- | ---------- | -------------- |
| `shared/diagnostic/diagnostic-record.ts` | `toBrowserErrorName` | 引数   | 1   | 158 | 入口で畳む | 1              |

## 積んだドラフト

「消せる」が 1 件以上ある 20 領域を、22 本のドラフトに割った。各ドラフトの最初の段は、呼び出し側を読んで消せるか確かめ、消せなければ本物として上の表を直す。小さい領域は同じ層のものをまとめ、名指すファイルは 8 以下、段は 4 以下に収めた。

| 要約（ドラフトの `--summary`）                     | 領域                                                                                                                 | 消せる件数 | 並び                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------ |
| undefined を畳む: サイドバー・画面ナビ・生成       | `src/browser/components`（サイドバー・画面ナビ・キャラ生成）                                                         | 6          |                          |
| undefined を畳む: 成果の画面の引数                 | `src/browser/components`（成果の画面）                                                                               | 7          |                          |
| undefined を畳む: 発話ログ・雑談表示の引数         | `src/browser/components`（発話ログ・雑談表示）                                                                       | 13         |                          |
| undefined を畳む: 入力欄・問い合わせの引数         | `src/browser/components`（入力欄・問い合わせ）                                                                       | 5          |                          |
| undefined を畳む: 本文表示の表・スクロール         | `src/browser/components`（本文表示）                                                                                 | 8          |                          |
| undefined を畳む: 再開カード・問いの回答・使用量   | `src/browser/components`（再開カード・問いの回答・使用量の画面）                                                     | 11         |                          |
| undefined を畳む: 描画器のグラフ・コード・色       | `src/browser/components`（Markdown の描画器 その1）                                                                  | 9          |                          |
| undefined を畳む: 描画器の注記・画像・シェル       | `src/browser/components`（Markdown の描画器 その2）                                                                  | 13         |                          |
| undefined を畳む: フックの書き込み判定 前半        | `scripts/hook`（`shell-write-rule.ts` の前半と、他の 2 ファイル）                                                    | 13         |                          |
| undefined を畳む: フックの書き込み判定 後半        | `scripts/hook`（`shell-write-rule.ts` の後半）                                                                       | 9          | 前半の後                 |
| undefined: ast-node の畳み方の優先を決める         | `scripts/shared`（`ast-node.ts` の方針。呼び出し側が広い）                                                           | （4）      | 実装の前                 |
| undefined を畳む: scripts/shared の判定関数        | `scripts/shared`（`ast-node.ts` 以外）                                                                               | 13         |                          |
| undefined を畳む: ast-node の4関数                 | `scripts/shared`（`ast-node.ts` の実装）                                                                             | 4          | 方針を決めるドラフトの後 |
| undefined を畳む: 撮影の道具の入口                 | `scripts/capture`                                                                                                    | 14         |                          |
| undefined を畳む: scripts/dev・document            | `scripts/dev`・`scripts/document`                                                                                    | 13         |                          |
| undefined を畳む: セッション駆動の読み取り         | `src/server/session-driver`                                                                                          | 9          |                          |
| undefined を畳む: 報告の記法まわり                 | `src/shared/report`                                                                                                  | 9          |                          |
| undefined を畳む: ブラウザ側の表示判定             | `src/browser/domain`                                                                                                 | 5          |                          |
| undefined を畳む: 現在の作業・設定・タスク盤       | `src/browser/features`                                                                                               | 4          |                          |
| undefined を畳む: 共有層のキャラ・セッション・診断 | `src/shared/character-pack`・`src/shared/session`・`src/shared/diagnostic`                                           | 8          |                          |
| undefined を畳む: サーバ側の小さな引数             | `src/server/chat`・`src/server/report`・`src/server/core`・`src/server/system-prompt`・`src/server/welcome-greeting` | 9          |                          |
| undefined を畳む: 起動依頼の chat と配信の版       | `src/server/session`・`src/(root)`                                                                                   | 2          |                          |

括弧なしの消せる件数の合計は 184 件で、領域の表の合計と一致する。`ast-node.ts` の 4 件は、方針を決めるドラフトでは括弧に入れ、実装のドラフトで数えた。
