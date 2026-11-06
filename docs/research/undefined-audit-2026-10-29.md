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
| `src/browser/components`      | 303      | 39          | 67                 | 197     |
| `src/server/session-driver`   | 102      | 29          | 5                  | 68      |
| `src/shared/character-pack`   | 70       | 0           | 2                  | 68      |
| `scripts/hook`                | 66       | 0           | 4                  | 62      |
| `scripts/capture`             | 62       | 2           | 4                  | 56      |
| `src/shared/report`           | 60       | 0           | 8                  | 52      |
| `src/server/character-pack`   | 45       | 36          | 0                  | 9       |
| `scripts/shared`              | 40       | 0           | 13                 | 27      |
| `src/browser/domain`          | 34       | 2           | 2                  | 30      |
| `src/server/view-server`      | 34       | 30          | 0                  | 4       |
| `src/shared/session`          | 30       | 0           | 1                  | 29      |
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
| `scripts/document`            | 13       | 1           | 1                  | 11      |
| `src/server/diary`            | 12       | 6           | 0                  | 6       |
| `src/browser/stores`          | 9        | 5           | 0                  | 4       |
| `src/wiring/(root)`           | 9        | 2           | 0                  | 7       |
| `src/(root)`                  | 8        | 0           | 0                  | 8       |
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
| **合計**                      | **1166** | **256**     | **133**            | **777** |

全件 = 6つに当たる + 消せる + 本物 は、領域ごとにも合計でも成り立つ（表を作った道具で突き合わせた）。

領域は `src/<層>/<機能>`、`scripts/` は下 1 階層。層の直下のファイルは `(root)`。

## 本物の理由

### 理由の種類と代表例

| 記号 | 理由                                                                                                    | 件  | 代表例                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 探索・解析・読み取りの失敗を単一の「無い」で返す戻り値                                                  | 374 | `browser/components/domain/sidebar/components/task-doing-count.tsx:10`・`browser/components/domain/sidebar/domain/plan-window.ts:25`・`browser/components/page/achievement/domain/written-time.ts:5`                                           |
| R2   | 環境変数・引数・状態ファイル・定義ファイル・SDK/外部 API など外の世界の値の写し、またはそれを受ける入口 | 190 | `browser/components/domain/portrait.tsx:41`・`browser/domain/appearance-color.ts:168`・`browser/features/task-board/domain/task-board-list-width.ts:15`                                                                                        |
| R3   | DOM 属性・描画の差し込みにそのまま渡す props（例6の趣旨だが `ui/` の外なので表の判定に当たらない）      | 23  | `browser/components/domain/portrait.tsx:30`・`browser/components/domain/screen-nav/components/screen-nav-settings-face-frame.tsx:13`・`browser/components/domain/screen-nav/components/session-switcher.tsx:281`                               |
| R4   | 持ち主が1つで、「まだ無い／選ばれていない」が1つの意味しか持たない値                                    | 131 | `browser/components/domain/character-face.tsx:13`・`browser/components/domain/portrait.tsx:28`・`browser/components/domain/screen-nav/hooks/use-screen-nav.ts:130`                                                                             |
| R5   | React・TanStack Query・DOM の外来シグネチャや入れ物（`RefObject` など）で型が決まっているもの           | 6   | `browser/components/page/achievement/hooks/use-achievement.ts:169`・`browser/components/page/conversation/components/dispatch/domain/prompt-image.ts:19`・`browser/components/page/conversation/components/dispatch/domain/prompt-image.ts:37` |
| R6   | 全域の対応表の「なし」（クラス名を付けない）が意味を持つ値                                              | 10  | `browser/components/ui/button/button.tsx:109`・`browser/components/ui/field/field.tsx:22`・`browser/components/ui/field/field.tsx:27`                                                                                                          |
| R7   | 位置を保つ配列の穴（読めなかった列を飛ばさず添字を揃える）                                              | 3   | `shared/report/timeline-scale.ts:26`・`shared/report/timeline-scale.ts:33`・`scripts/dev/lib/a2ui-write-trial.ts:346`                                                                                                                          |
| R8   | ループの終端・畳み込みの途中経過・蓄積値（例4に準ずる）                                                 | 11  | `browser/components/domain/screen-nav/hooks/use-screen-nav.ts:197`・`browser/components/page/achievement/hooks/use-diary-book.ts:383`・`browser/components/page/achievement/hooks/use-diary-book.ts:393`                                       |
| R9   | イベントを出さない場合を「無い」で表す口（呼び出し側は無ければ何もしない）                              | 14  | `current-character.ts:63`・`current-character.ts:69`・`current-character.ts:76`                                                                                                                                                                |
| R10  | `undefined` 自体が「止める・外す・準備なし」という指示の意味を持つ引数                                  | 15  | `browser/domain/reveal/brush-scroll.ts:42`・`browser/domain/reveal/brush-scroll.ts:85`・`browser/domain/reveal/brush-tip.ts:63`                                                                                                                |

### 領域ごとの理由

| 領域                          | 本物 | 理由の内訳                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/browser/components`      | 197  | R1 88（例 `browser/components/domain/sidebar/components/task-doing-count.tsx:10`）、R4 67（例 `browser/components/domain/character-face.tsx:13`）、R3 20（例 `browser/components/domain/portrait.tsx:30`）、R6 7（例 `browser/components/ui/button/button.tsx:109`）、R5 6（例 `browser/components/page/achievement/hooks/use-achievement.ts:169`）、R8 4（例 `browser/components/domain/screen-nav/hooks/use-screen-nav.ts:197`）、R2 3（例 `browser/components/domain/portrait.tsx:41`）、R10 2（例 `browser/components/page/conversation/components/markdown/renderer/report-image.tsx:62`） |
| `src/server/session-driver`   | 68   | R1 43（例 `server/session-driver/core/aside-prompt.ts:18`）、R2 24（例 `server/session-driver/core/pending-answer.ts:37`）、R10 1（例 `server/session-driver/core/prompt-delay.ts:14`）                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/character-pack`   | 68   | R2 46（例 `shared/character-pack/character-asset.ts:18`）、R1 20（例 `shared/character-pack/character-asset.ts:36`）、R4 2（例 `shared/character-pack/character.ts:142`）                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts/hook`                | 62   | R1 38（例 `scripts/hook/bash-guard.ts:24`）、R2 3（例 `scripts/hook/lib/bash-hook-call.ts:8`）、R8 3（例 `scripts/hook/bash-guard.ts:24`）、R4 18（例 `scripts/hook/lib/shell-write-rule.ts:101`）                                                                                                                                                                                                                                                                                                                                                                                              |
| `scripts/capture`             | 56   | R1 25（例 `scripts/capture/capture-catalog.ts:262`）、R2 26（例 `scripts/capture/capture-catalog.ts:82`）、R10 5（例 `scripts/capture/lib/scene-end.ts:26`）                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/report`           | 52   | R1 31（例 `shared/report/a2ui-report-outline.ts:82`）、R4 15（例 `shared/report/code-mark.ts:51`）、R8 2（例 `shared/report/graph-fold.ts:64`）、R7 2（例 `shared/report/timeline-scale.ts:26`）、R3 1（例 `shared/report/graph-fold-html.ts:43`）、R10 1（例 `shared/report/table-view.ts:25`）                                                                                                                                                                                                                                                                                                |
| `src/server/character-pack`   | 9    | R2 4（例 `server/character-pack/core/character-generation.ts:41`）、R9 3（例 `server/character-pack/core/character-pack-command.ts:22`）、R1 2（例 `server/character-pack/core/character-generation.ts:76`）                                                                                                                                                                                                                                                                                                                                                                                    |
| `scripts/shared`              | 27   | R1 15（例 `scripts/shared/ast-node.ts:8`）、R2 12（例 `scripts/shared/claude-environment.ts:16`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/browser/domain`          | 30   | R1 14（例 `browser/domain/effort-label.ts:45`）、R4 11（例 `browser/domain/appearance-color.ts:20`）、R10 4（例 `browser/domain/reveal/brush-scroll.ts:42`）、R2 1（例 `browser/domain/appearance-color.ts:168`）                                                                                                                                                                                                                                                                                                                                                                               |
| `src/server/view-server`      | 4    | R2 4（例 `server/view-server/core/connection-grant.ts:7`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/shared/session`          | 29   | R2 20（例 `shared/session/main-view-shape.ts:296`）、R1 7（例 `shared/session/model-name.ts:27`）、R3 1（例 `shared/session/session-event-report.ts:77`）、R4 1（例 `shared/session/work-plan.ts:309`）                                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/dev`                 | 16   | R1 10（例 `scripts/dev/harness-replay.ts:48`）、R2 5（例 `scripts/dev/check.ts:357`）、R7 1（例 `scripts/dev/lib/a2ui-write-trial.ts:346`）                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/server/core`             | 24   | R2 16（例 `server/core/config.ts:111`）、R1 6（例 `server/core/config.ts:209`）、R9 2（例 `server/core/command-receiver.ts:21`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/browser/features`        | 19   | R4 8（例 `browser/features/task-board/components/task-attribute.tsx:24`）、R1 4（例 `browser/features/current-work/domain/current-work-step.ts:105`）、R6 3（例 `browser/features/task-board/components/task-board-sort-choice.tsx:22`）、R2 3（例 `browser/features/task-board/domain/task-board-list-width.ts:15`）、R3 1（例 `browser/features/run-setting/components/run-setting-select.tsx:42`）                                                                                                                                                                                           |
| `src/server/chat`             | 7    | R1 6（例 `server/chat/core/archive/chat-archive-entry.ts:19`）、R9 1（例 `server/chat/core/chat-command.ts:13`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/server/session`          | 10   | R1 8（例 `server/session/core/changed-file-line.ts:13`）、R8 1（例 `server/session/core/changed-file-line.ts:39`）、R10 1（例 `server/session/core/waiting-line-alarm.ts:9`）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/server/report`           | 7    | R1 5（例 `server/report/core/rules/structure.ts:253`）、R4 2（例 `server/report/core/rules/structure.ts:175`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/server/item`             | 8    | R9 4（例 `server/item/core/item-command.ts:14`）、R1 4（例 `server/item/core/item-edit.ts:34`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/server/usage`            | 6    | R1 3（例 `server/usage/core/token-usage.ts:296`）、R4 2（例 `server/usage/core/token-usage.ts:63`）、R2 1（例 `server/usage/core/usage-review-runner.ts:45`）                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scripts/document`            | 11   | R1 8（例 `scripts/document/closing-bold.ts:95`）、R2 3（例 `scripts/document/section-reference.ts:35`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/server/diary`            | 6    | R2 3（例 `server/diary/core/diary-tool.ts:193`）、R1 2（例 `server/diary/core/diary-tool.ts:177`）、R4 1（例 `server/diary/core/diary-tool.ts:46`）                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/browser/stores`          | 4    | R4 2（例 `browser/stores/turn-selection.ts:21`）、R10 1（例 `browser/stores/session.ts:70`）、R1 1（例 `browser/stores/turn-selection.ts:54`）                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/wiring/(root)`           | 7    | R2 5（例 `wiring/session-launch.ts:206`）、R1 2（例 `wiring/diary.ts:44`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/(root)`                  | 8    | R9 4（例 `current-character.ts:63`）、R1 2（例 `cli.ts:90`）、R2 2（例 `main.ts:291`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/runtime`             | 7    | R1 4（例 `scripts/runtime/diagnostic.ts:86`）、R2 3（例 `scripts/runtime/diagnostic.ts:103`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/shared/session-driver`   | 7    | R1 4（例 `shared/session-driver/prompt-image.ts:107`）、R2 3（例 `shared/session-driver/api-trouble.ts:36`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/server/achievement`      | 1    | R1 1（例 `server/achievement/core/done-task.ts:38`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/server/work-plan`        | 4    | R1 3（例 `server/work-plan/core/band-position.ts:41`）、R2 1（例 `server/work-plan/core/work-plan-gate.ts:54`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/item`             | 5    | R1 5（例 `shared/item/item.ts:39`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/server/recommendation`   | 2    | R1 2（例 `server/recommendation/core/recommendation.ts:86`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/server/welcome-greeting` | 1    | R8 1（例 `server/welcome-greeting/core/kept-welcome.ts:47`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/repository`       | 3    | R4 2（例 `shared/repository/task-summary.ts:46`）、R1 1（例 `shared/repository/task-summary.ts:92`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/browser/utils`           | 2    | R1 2（例 `browser/utils/data-url.ts:5`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/server/workflow-setting` | 2    | R1 2（例 `server/workflow-setting/core/workflow-setting-reading.ts:179`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/achievement`      | 2    | R1 2（例 `shared/achievement/achievement.ts:168`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/usage`            | 2    | R2 2（例 `shared/usage/plan-usage.ts:13`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/shared/utils`            | 2    | R1 2（例 `shared/utils/image-data-url.ts:25`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/(root)`           | 1    | R1 1（例 `shared/frame.ts:99`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/diary`            | 1    | R1 1（例 `shared/diary/diary.ts:105`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 数えて分かったこと

- 本物 777 件のうち R1 が 374 件で約半分。戻り値と `Promise<…>` の型引数は、署名と関数名から「見つからない・読めない」を返す形かを見て R1 に入れた（本体は読んでいない）。この形は規約の6つの表に直接の行が無く、例2（TypeScript が生む `undefined`）に準ずるものとして書いてある。表に行を足すかどうかは、この文書の範囲の外。
- R3 は `className`・`title`・`blockedTitle` など DOM 属性に素通しする props で、例6と同じ性質なのに `src/browser/components/ui/` の外にあるため表の判定に当たらない。例6の範囲を `ui/` の外へ広げるかは別の判断になる。

### 呼び出し側を読んで本物に移した件

「消せる」と見立てた件のうち、呼び出し側を読んで本物と分かったもの。理由は撮影の道具の入口の10件（R2・R10）と `toReference` の `section`（R2）とセッション駆動の読み取りの4件（R1・R2）と `tableRowFilterTexts` の `column`（R10）と `expressionChoices` の `definition`（R2）と描画器の3関数（R2・R3・R10）と `ast-node.ts` の4関数（R2）を除いて R4（持ち主が1つで、「まだ無い」が1つの意味しか持たない）。
成果の画面の3件は、持ち主がセッションの状態で、キャラクター定義が届く前という意味しか持たない。畳み先に当たる既定の `CharacterInfo` が無く、消すと `!`・`as` か存在しない既定値が要る。
表示判定の3件（`characterFaceInfo`・`portraitAppearance`・`resolveEffortSelect`）も R4 で、`character` は定義が届く前、`effort` はまだ読まれていないという意味しか持たない。呼び出し側がその状態をそのまま運び、畳むと各所に同じ分岐を複製するだけになる。
共有層のキャラ・セッションの4件のうち、`shownCharacterPackName`・`effectiveAccent` の `character` は成果の画面と同じ R4（セッションの状態で、定義が届く前）で、呼び出し側 3 か所が `undefined` をそのまま運ぶ。`settleDelegatedRange` の `returnedCount` も R4 で、`phase_result` がまだ届いていないという 1 つの意味しか持たず、番兵にすると `0`（段が 0）と区別できない。`expressionChoices` の `definition` は R2 で、定義ファイルの読み取りの写し（定義が無い・壊れたパック）を 8 か所が `seed.pack.definition` のまま渡し、畳むと 5 ファイルに同じ分岐を複製する。
描画器の注記・画像の3関数は、`resolveNotationClassName` が R3（props の `className` の素通しが 7 か所で、`""` に畳むと DOM に `class=""` が出る）、`openZoom` の `opener` が R10（`closest("button")` が無い＝閉じたあとに戻すフォーカス先が無い、という指示）、`sameRegion` の `region` が R2（画像の領域の指定が無いという `parseImageRegion` の値の写しで、`SwapThumb.region` も同じ意味）。
`serveAsset` の `version` は R2 で、要求の `?v=` が無いという外の世界の値の写し。`ServeCharacterAsset`・`writeCharacterAsset`・`readCharacterAsset` が同じ `string | undefined` を素通しするので、`serveAsset` だけ畳むと空文字の番兵になり、合併型にすると名指しの外の 6 ファイル超へ型が広がる。
発話ログ・雑談表示の3件は、`useCharacterClock` の `waitingDueAt` が「待ちの一言の期日が無い」、`useSpeechLog` の `pinnedSpeech` が「何も留めていない」、`advanceReveal` の `lastRevealAt` が「まだ吹き出しを出していない」を表す。
`Infinity`・`-Infinity` で畳むとタイマーが直ちに鳴り続ける、または状態の形が変わる。`pinnedSpeech` はビューモデルの欄を運ぶ props で、畳むと呼び出し側の型が名指しの外へ広がる。
フックの書き込み判定の前半の11件は、2つに分かれる。`writeRuleOf` ほか `directory` を受ける8件は、`cd $x`・`popd`・`cd -` で `cd` を追えなくなった状態を、`findWorkTreeWriteRule` のループが持ち回る。同じ値が後半の `scriptRunDirectories`・`readScriptFile`・`absoluteScriptPath` にも渡るので、合併型にしても境で `undefined` への変換が増えるだけ。`workRoot` を受ける3件は、`undefined` が「作業ツリーの根が決まらない」を意味し、このとき Python の判定は走ってシェルの書き込みの判定だけ飛ばす。後半の `isDeniedPythonCode`・`hasUnsafeWrite`・`isLiteralOutsideWorkTree`・`readPythonScripts` が同じ `undefined` を読むので、前半だけ値にすると挙動が変わる。
フックの書き込み判定の後半の9件のうち、`startDirectory` の `cwd` と `isCommandBoundary` は畳めた（呼び出し側が `cwd ?? workRoot` を渡す。`index > 0` の中で `charAt` を渡す）。残る7件は R4 で、前半と同じ2つの値の続き。`isDeniedPythonCode`・`hasUnsafeWrite`・`isLiteralOutsideWorkTree`・`readPythonScripts` の `workRoot` は、`undefined` が「作業ツリーの根が決まらない」の1つの意味で、`isLiteralOutsideWorkTree` が偽を返して読めない書き込みを拒む側に倒す。畳むと根の有無で関数を二重に持つか番兵が要る。`readScriptFile`・`absoluteScriptPath`・`readPythonScripts` の `cwd` は、`cd` を追えなくなった状態を持ち回る値で、畳むと境で `undefined` への変換が増えるだけ。
入力欄の2件は、`draftOnSessionChange` の `previous`・`next` が「セッションが未確定」を表す。同じ `sessionId` を入力欄のフックの ref・effect の依存・下書きの保存と消去も使うので、引数だけを合併型にしても変換が両端に増えるだけで、全部を合併型にすると型が名指しの外へ広がる。
撮影の道具の入口の10件は、2つに分かれる。`sourceOf` の5引数は、`--url`・`--scene`・`--until-step`・`--cwd`・`--session` が無いという `parseArgs` の値の写しで、有無を判定するのがこの関数そのもの（R2）。`until` の4件（`Source`・`sceneEndTarget`・`sceneEventTimeoutMs`・`countedSteps`）は、`startupSteps` の `sceneUntil` が `undefined` に「場面の手を切らない」の意味を持たせている。`Source.session` は `readFakeSession` の既定引数が `undefined` で同梱のファイルに落ちる（R10）。個数の既定値や番兵値で畳むと、別の意味の値になる。
`toReference` の `section` は、`REFERENCE_HEAD` の第2群（節番号）が省略できる群の写しで、`SectionReference.section` が番号の無い参照を `undefined` で持つ出力の型でもある。畳むと呼び出し側が番号の無い参照を別の形で持つだけになる。`targetPath`（229）は第1群が必須なので、呼び出し側で畳めた。
セッション駆動の読み取りの4件は、どれも「無い」が上流の外の値か型から続いている。`planName` の `subscriptionType` は `toPlan(await session.accountInfo())` が SDK の段なし（API キー・Bedrock）をそのまま返す値で、`""` に潰すと番兵になる。`decideSessionTitle` の `currentTitle` は SDK の `customTitle`（題がまだ無い）で、`state.lastWritten` と比べる判断の入力そのもの。`withSessionMark` の `worktree` は `worktreeNameOf` が作業ツリーの名前を決められない状態で、値が要るのは足す行だけ、既存の行の印の更新には要らない。「ある場合にだけ呼ぶ」にすると更新の経路まで止まり、更新と足すに分けると既存の有無の判定が呼び出し側で二重になる（R2）。`clipped` の `text` は `DigestFold.summary`・`conclusionBullets` の戻り値から続く R1 で、入口を `string` にしても 3 呼び出しに分岐が移るだけ。
`tableRowFilterTexts` の `column` は、サーバの構造検査もブラウザの表の絞り込みも `filterColumn`（省略できる欄）をそのまま渡し、`undefined` が「全列」という指示を表す（R10）。畳むと 2 つの呼び出し側に同じ分岐を複製するだけになる。
`ast-node.ts` の4関数（`literalString`・`objectField`・`stringField`・`arrayField`）は、どれも畳まず合併型にもしない R2 で、`parseSync` が返す型の無い構文木を `Reflect.get` で読む入口。引数の `undefined` は「前の読みでその欄が無かった」の1つの意味しか持たず、それを鎖の次の読みへ運ぶのがこの関数の役目。
引数を `AstNode` に狭めて型検査を打つと、`stringField` 106 件（14 ファイル）・`objectField` 21 件（11 ファイル）・`arrayField` 8 件（8 ファイル）・`literalString` 4 件（2 ファイル）が落ちる。落ちた行はどれも `objectField(…)` の戻り値・`arrayField(…)[0]`・分割代入の要素を渡す鎖の途中で、呼び出し側は「欄が無い」と「その型でない」を同じに扱う（例 `module-reference.ts` の `literalString(objectField(node, "source")) ?? DYNAMIC`）。畳むと各所に同じ `=== undefined` の分岐を複製するだけになる。
合併型（見つかった・無い）にしても「無い」以外の状態は増えない。`test/` の 10 ファイル（規約のテスト 9 と `e2e-scenario.test.ts`）も同じ鎖で構文木を読む。
`src/server/report` の 30 件と `src/server/work-plan` の 7 件は、引数の `| undefined` が `judgeImplementerStop` の `agentPhaseTitle` だけで、フックの入口で畳んで消した（写しに無い agent はフックが `{}` を返す）。残りは戻り値と変数で、どれも本物。
残る 37 件（report 30・work-plan 7）は、下の表の `server/report/…`・`server/work-plan/…` の行に1件ずつ載せた。戻り値は R1（探索・解析の失敗を返す）、局所の `let` は R4、`workflowAgentPhase` は R2（ワークフロースクリプトの写しに無いという外の値）。
`work-plan-review.ts` の `returnedCount`・`confirmedRange`、`report-review.ts` の `handlerReasons`、`report-inheritance.ts` の `base` は、局所の `let` で「まだ決まっていない」が1つの意味しか持たない R4。
`?? ""` は、正規表現の群・`split` の添字の `noUncheckedIndexedAccess` 由来と、`conclusionFirstSentence` の「要素なしなら空の文字列」という値としての `""` を据え置き、`figure` の `question` は番兵だったので、スキーマの検査に任せて消した。`claims` の `basis`・`howToVerify`（`claimNotes`、`body-fence-reader.ts:169・171`）と `readCode` の `path`（同 `:145`）は、いまは `=== undefined ? "" : …` の三項演算子の形で、空の文字列を「無い」の印にする書き方が残っている。`?? ""` の grep には掛からず、どのタスクにも載っていない。`grep -rn '?? ""' src/server/report src/server/work-plan` が返すのは 13 行で、上の据え置きの理由に当たるものと `work-plan-gate.ts:110` の表示用の文字列である。
会話画面の `domain/`・`stores/`・`components/hooks/` の 20 件（`| undefined`）は、呼ぶ側を読んで全て本物と分かり、1件も消していない。
戻り値の失敗を単一の「無い」で返す R1 が 15 件（`shrinkToThumbnail`・`decodeImage`・`graphFoldFigure`・`mainPathOf`・`sideAnchorsOf`・`laidOut`・`attachOf`・`cardChainOf`・`cardChainOrder`・`previousSessionOf`・`mainViewRootOf`・`rememberedPosition`・`loadSessionDraft`、図形の `toneOf`）。
`graphFoldFigure` の `reduce` の蓄積値は、候補が 0 件の「当たらない」を表す R1。`mainViewRootOf` は `closest` の `null` を入口で畳んだ結果で、`useHeightVariableRef` が「根が無い」を `undefined` で受ける。
`draftOnSessionChange` の戻り値（入力欄をそのままにする指示）は R10、引数の `previous`・`next`（セッション未確定）は入力欄の2件と同じ R4。`useWaitingLineDueAt` の `number | undefined` は、待ちの一言の期日が無いという `waitingLineDueAt` の値の写しで R2。`use-speech-press.ts` の `PressOrigin | undefined` は「押し始めていない」を持つ ref で R4。
この20件（domain 17・stores 2・hooks 1）は、下の表の `conversation/domain/`・`stores/`・`components/hooks/` の行に1件ずつ載せた。
`?? ""` の5件は、正規表現の群・配列の添字・`Map.get` の未登録の鍵の `noUncheckedIndexedAccess` 由来で、「空」と「無い」が DOM に出る文字列で同じ意味のもの（`stat-layout.ts` の `unit`・`report-diagram-markdown.ts` の系列名・`phase-recap.ts` の要約・`inquiry-answer.ts` の書いた答え2件）。番兵ではないので残す。

| ファイル                                                                                     | 対象                           | 置き場     | 行  | 理由 |
| -------------------------------------------------------------------------------------------- | ------------------------------ | ---------- | --- | ---- |
| `browser/components/page/achievement/domain/diary-writer.ts`                                 | `currentWriterPortraitOf`      | 引数       | 34  | R4   |
| `browser/components/page/achievement/hooks/use-achievement.ts`                               | `reviewButtonOf`               | 引数       | 293 | R4   |
| `browser/components/page/achievement/hooks/use-diary-book.ts`                                | `pageOf`                       | 引数       | 254 | R4   |
| `browser/components/page/conversation/components/character-view/hooks/use-character-view.ts` | `useCharacterClock`            | 引数       | 304 | R4   |
| `browser/components/page/conversation/components/character-view/hooks/use-speech-log.ts`     | `useSpeechLog`                 | 引数       | 83  | R4   |
| `browser/components/page/conversation/components/chat-view/hooks/use-speech-reveal.ts`       | `advanceReveal`                | 引数       | 110 | R4   |
| `browser/components/page/conversation/domain/composer-draft-storage.ts`                      | `draftOnSessionChange`         | 引数       | 45  | R4   |
| `browser/components/page/conversation/domain/composer-draft-storage.ts`                      | `draftOnSessionChange`         | 引数       | 46  | R4   |
| `scripts/hook/lib/shell-write-rule.ts`                                                       | `findDeniedBashRule`           | 引数       | 101 | R4   |
| `scripts/hook/lib/shell-write-rule.ts`                                                       | `findDeniedCommandRule`        | 引数       | 115 | R4   |
| `scripts/hook/lib/shell-write-rule.ts`                                                       | `isDeniedPythonCode`           | 引数       | 352 | R4   |
| `scripts/hook/lib/shell-write-rule.ts`                                                       | `hasUnsafeWrite`               | 引数       | 357 | R4   |
| `scripts/hook/lib/shell-write-rule.ts`                                                       | `isLiteralOutsideWorkTree`     | 引数       | 366 | R4   |
| `scripts/hook/lib/python-script-read.ts`                                                     | `readPythonScripts`            | 引数       | 40  | R4   |
| `scripts/hook/lib/python-script-read.ts`                                                     | `readPythonScripts`            | 引数       | 41  | R4   |
| `scripts/hook/lib/working-directory.ts`                                                      | `directoryOfCwd`               | 引数       | 16  | R4   |
| `scripts/hook/lib/worktree-shell-write.ts`                                                   | `findWorktreeShellWriteDenial` | 引数       | 25  | R4   |
| `scripts/capture/lib/capture-source.ts`                                                      | `Source`                       | プロパティ | 12  | R10  |
| `scripts/capture/lib/capture-source.ts`                                                      | `Source`                       | プロパティ | 16  | R10  |
| `scripts/capture/lib/capture-source.ts`                                                      | `sourceOf`                     | 引数       | 28  | R2   |
| `scripts/capture/lib/capture-source.ts`                                                      | `sourceOf`                     | 引数       | 29  | R2   |
| `scripts/capture/lib/capture-source.ts`                                                      | `sourceOf`                     | 引数       | 30  | R2   |
| `scripts/capture/lib/capture-source.ts`                                                      | `sourceOf`                     | 引数       | 31  | R2   |
| `scripts/capture/lib/capture-source.ts`                                                      | `sourceOf`                     | 引数       | 32  | R2   |
| `scripts/capture/lib/scene-end.ts`                                                           | `sceneEndTarget`               | 引数       | 26  | R10  |
| `scripts/capture/lib/scene-end.ts`                                                           | `sceneEventTimeoutMs`          | 引数       | 73  | R10  |
| `scripts/capture/lib/scene-end.ts`                                                           | `countedSteps`                 | 引数       | 161 | R10  |
| `scripts/document/section-reference.ts`                                                      | `toReference`                  | 引数       | 230 | R2   |
| `server/session-driver/core/plan.ts`                                                         | `planName`                     | 引数       | 27  | R2   |
| `server/session-driver/core/session/session-catalog.ts`                                      | `withSessionMark`              | 引数       | 148 | R2   |
| `server/session-driver/core/session/session-digest.ts`                                       | `clipped`                      | 引数       | 91  | R1   |
| `server/session-driver/core/session/session-title.ts`                                        | `decideSessionTitle`           | 引数       | 51  | R2   |
| `shared/report/table-view.ts`                                                                | `tableRowFilterTexts`          | 引数       | 25  | R10  |
| `browser/domain/character-face.ts`                                                           | `characterFaceInfo`            | 引数       | 11  | R4   |
| `browser/domain/effort-label.ts`                                                             | `resolveEffortSelect`          | 引数       | 77  | R4   |
| `browser/domain/portrait-appearance.ts`                                                      | `portraitAppearance`           | 引数       | 20  | R4   |
| `shared/character-pack/character.ts`                                                         | `effectiveAccent`              | 引数       | 174 | R4   |
| `shared/character-pack/expression-choice.ts`                                                 | `expressionChoices`            | 引数       | 21  | R2   |
| `shared/session/work-plan.ts`                                                                | `settleDelegatedRange`         | 引数       | 309 | R4   |
| `current-character.ts`                                                                       | `serveAsset`                   | 引数       | 89  | R2   |
| `browser/components/page/conversation/components/markdown/renderer/notation.tsx`             | `resolveNotationClassName`     | 引数       | 171 | R3   |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`         | `openZoom`                     | 引数       | 62  | R10  |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`         | `openZoom`                     | 引数       | 117 | R10  |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`         | `sameRegion`                   | 引数       | 332 | R2   |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`         | `sameRegion`                   | 引数       | 332 | R2   |
| `scripts/shared/ast-node.ts`                                                                 | `literalString`                | 引数       | 19  | R2   |
| `scripts/shared/ast-node.ts`                                                                 | `objectField`                  | 引数       | 33  | R2   |
| `scripts/shared/ast-node.ts`                                                                 | `stringField`                  | 引数       | 38  | R2   |
| `server/report/core/body/body-fence-reader.ts`                                               | `readTypedFence`               | 戻り値     | 60  | R1   |
| `server/report/core/body/body-fence-reader.ts`                                               | `readTable`                    | 戻り値     | 96  | R1   |
| `server/report/core/body/body-fence-reader.ts`                                               | `readCode`                     | 戻り値     | 132 | R1   |
| `server/report/core/body/body-fence-reader.ts`                                               | `readClaims`                   | 戻り値     | 148 | R1   |
| `server/report/core/body/body-fence-reader.ts`                                               | `readImage`                    | 戻り値     | 175 | R1   |
| `server/report/core/body/body-fence.ts`                                                      | `readFence`                    | 戻り値     | 69  | R1   |
| `server/report/core/body/body-fence.ts`                                                      | `openingOf`                    | 戻り値     | 112 | R1   |
| `server/report/core/body/body-figure-fence.ts`                                               | `readFigureFence`              | 戻り値     | 16  | R1   |
| `server/report/core/body/body-figure-fence.ts`                                               | `declaredKeyTypeOf`            | 戻り値     | 63  | R1   |
| `server/report/core/body/body-figure-fence.ts`                                               | `columnsOf`                    | 戻り値     | 77  | R1   |
| `server/report/core/body/body-figure-fence.ts`                                               | `toNumber`                     | 戻り値     | 109 | R1   |
| `server/report/core/body/conclusion-sentence.ts`                                             | `parseConclusion`              | 戻り値     | 16  | R1   |
| `server/report/core/body/conclusion-sentence.ts`                                             | `conclusionSentences`          | 戻り値     | 28  | R1   |
| `server/report/core/body/legacy-report-component-list.ts`                                    | `legacyReportComponents`       | 戻り値     | 55  | R1   |
| `server/report/core/image/report-image-shelf.ts`                                             | `ReadReportImagePath`          | 戻り値     | 35  | R1   |
| `server/report/core/image/report-image-shelf.ts`                                             | `ReadReportImage`              | 戻り値     | 41  | R1   |
| `server/report/core/image/report-image-shelf.ts`                                             | `find`                         | 戻り値     | 61  | R1   |
| `server/report/core/review/report-review.ts`                                                 | `handlerReasons`               | 変数       | 99  | R4   |
| `server/report/core/review/report-inheritance.ts`                                            | `base`                         | 変数       | 36  | R4   |
| `server/report/core/rules/report-violation.ts`                                               | `line`                         | 戻り値     | 146 | R1   |
| `server/report/core/rules/expression-evaluation-fault.ts`                                    | `shapeProblem`                 | 戻り値     | 103 | R1   |
| `server/report/core/rules/expression-evaluation-fault.ts`                                    | `shapeProblem` の `list`       | 変数       | 104 | R4   |
| `server/report/core/rules/expression-evaluation-fault.ts`                                    | `resolve`                      | 戻り値     | 137 | R1   |
| `server/report/core/rules/structure.ts`                                                      | `firstLeafReference`           | 戻り値     | 208 | R1   |
| `server/report/core/rules/structure.ts`                                                      | `search`                       | 戻り値     | 213 | R1   |
| `server/report/core/rules/structure.ts`                                                      | `placementFault`               | 戻り値     | 370 | R1   |
| `server/report/core/rules/parameter-fault.ts`                                                | `nameProblem`                  | 戻り値     | 76  | R1   |
| `server/report/core/rules/block/code-match.ts`                                               | `codeBlockStartLine`           | 戻り値     | 32  | R1   |
| `server/report/adapter/report-file.ts`                                                       | `readOne`                      | 戻り値     | 34  | R1   |
| `server/report/adapter/report-image-file.ts`                                                 | `readReportImageFile`          | 戻り値     | 65  | R1   |
| `server/work-plan/core/phase-result.ts`                                                      | `parsePhaseResult`             | 戻り値     | 71  | R1   |
| `server/work-plan/core/band-position.ts`                                                     | `delegatedRangeFromAnswer`     | 戻り値     | 46  | R1   |
| `server/work-plan/core/work-plan-gate.ts`                                                    | `givenPhaseIdsOf`              | 戻り値     | 158 | R1   |
| `server/work-plan/core/work-plan-review.ts`                                                  | `workflowAgentPhase`           | 戻り値     | 92  | R2   |
| `server/work-plan/core/work-plan-review.ts`                                                  | `returnedCount`                | 変数       | 120 | R4   |
| `server/work-plan/core/work-plan-review.ts`                                                  | `confirmedRange`               | 変数       | 122 | R4   |
| `server/work-plan/core/work-plan-review.ts`                                                  | `judgeSkipMarks`               | 戻り値     | 153 | R1   |
| `scripts/shared/ast-node.ts`                                                                 | `arrayField`                   | 引数       | 43  | R2   |
| `browser/components/page/conversation/domain/composer-draft-storage.ts`                      | `draftOnSessionChange`         | 戻り値     | 48  | R10  |
| `browser/components/page/conversation/domain/composer-draft-storage.ts`                      | `loadSessionDraft`             | 戻り値     | 68  | R1   |
| `browser/components/page/conversation/domain/prompt-image-thumbnail.ts`                      | `shrinkToThumbnail`            | 戻り値     | 22  | R1   |
| `browser/components/page/conversation/domain/prompt-image-thumbnail.ts`                      | `decodeImage`                  | 戻り値     | 49  | R1   |
| `browser/components/page/conversation/domain/graph-fold.ts`                                  | `graphFoldFigure`              | 戻り値     | 43  | R1   |
| `browser/components/page/conversation/domain/graph-fold.ts`                                  | `graphFoldFigure` の `reduce`  | 変数       | 67  | R1   |
| `browser/components/page/conversation/domain/graph-fold.ts`                                  | `mainPathOf`                   | 戻り値     | 82  | R1   |
| `browser/components/page/conversation/domain/graph-fold.ts`                                  | `sideAnchorsOf`                | 戻り値     | 135 | R1   |
| `browser/components/page/conversation/domain/graph-fold-layout.ts`                           | `laidOut`                      | 戻り値     | 43  | R1   |
| `browser/components/page/conversation/domain/graph-fold-layout.ts`                           | `attachOf`                     | 戻り値     | 230 | R1   |
| `browser/components/page/conversation/domain/card-chain-markdown.ts`                         | `cardChainOf`                  | 戻り値     | 30  | R1   |
| `browser/components/page/conversation/domain/card-chain-markdown.ts`                         | `cardChainOrder`               | 戻り値     | 89  | R1   |
| `browser/components/page/conversation/domain/welcome-entry-list.ts`                          | `previousSessionOf`            | 戻り値     | 49  | R1   |
| `browser/components/page/conversation/domain/main-view-focus.ts`                             | `mainViewRootOf`               | 戻り値     | 10  | R1   |
| `browser/components/page/conversation/domain/report-diagram-markdown.ts`                     | `toneOf`                       | 戻り値     | 319 | R1   |
| `browser/components/page/conversation/stores/reading-position.ts`                            | `rememberedPosition`           | 戻り値     | 45  | R1   |
| `browser/components/page/conversation/stores/shown-reaction.ts`                              | `useWaitingLineDueAt`          | 戻り値     | 19  | R2   |
| `browser/components/page/conversation/components/hooks/use-speech-press.ts`                  | `pressOriginRef`               | 変数       | 31  | R4   |     |

## 消せるもの

領域ごとの対象。ドラフトはこの単位で割る。「入口で畳む」は、呼び出し側で分岐するか `??` で既定値にして、関数を必ずある値で受ける形にすること。「（広い）」は呼び出し側が 25 を超えるもので、ドラフトにする前に畳み方の優先を決める。

### `src/browser/components`（消せる 67 件）

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
| `browser/components/page/conversation/components/markdown/renderer/notation.tsx`              | `noteKind`                 | 引数   | 1   | 182                | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/note-label.tsx`            | `noteLabelColorClass`      | 引数   | 1   | 28                 | 入口で畳む | 1              |
| `browser/components/page/conversation/components/markdown/renderer/report-image.tsx`          | `readCaption`              | 引数   | 1   | 312                | 入口で畳む | 1              |
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

### `scripts/hook`（消せる 4 件）

| ファイル                                   | 対象                  | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ------------------------------------------ | --------------------- | ------ | --- | --- | ---------- | -------------- |
| `scripts/hook/lib/foreign-restore.ts`      | `createWorktreeProbe` | 引数   | 1   | 61  | 入口で畳む | 1              |
| `scripts/hook/lib/working-directory.ts`    | `startDirectory`      | 引数   | 1   | 21  | 入口で畳む | 2              |
| `scripts/hook/lib/shell-write-rule.ts`     | `isCommandBoundary`   | 引数   | 1   | 394 | 入口で畳む | 1              |
| `scripts/hook/lib/worktree-shell-write.ts` | `readWorkRoot`        | 引数   | 1   | 32  | 入口で畳む | 1              |

### `scripts/shared`（消せる 13 件）

| ファイル                                    | 対象                | 置き場 | 件  | 行     | 消し方     | 呼び出し側の数 |
| ------------------------------------------- | ------------------- | ------ | --- | ------ | ---------- | -------------- |
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

### `scripts/capture`（消せる 4 件）

| ファイル                                  | 対象             | 置き場     | 件  | 行  | 消し方                             | 呼び出し側の数 |
| ----------------------------------------- | ---------------- | ---------- | --- | --- | ---------------------------------- | -------------- |
| `scripts/capture/lib/capture-source.ts`   | `Source`         | プロパティ | 1   | 14  | 合併型（URL か場面かで欄を分ける） | 4              |
| `scripts/capture/lib/capture-stub.ts`     | `isStubbedCall`  | 引数       | 1   | 45  | 入口で畳む                         | 1              |
| `scripts/capture/lib/catalog-setup.ts`    | `launchPlaceOf`  | 引数       | 1   | 47  | 入口で畳む                         | 1              |
| `scripts/capture/lib/comparison-draft.ts` | `describeNumber` | 引数       | 1   | 83  | 入口で畳む                         | 1              |

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

### `src/server/session-driver`（消せる 5 件）

| ファイル                                       | 対象           | 置き場 | 件  | 行     | 消し方     | 呼び出し側の数 |
| ---------------------------------------------- | -------------- | ------ | --- | ------ | ---------- | -------------- |
| `server/report/core/body/body-figure-fence.ts` | `keyTypeOf`    | 引数   | 2   | 57・58 | 入口で畳む | 1              |
| `server/report/core/body/body-figure-fence.ts` | `columnsOf`    | 引数   | 1   | 75     | 入口で畳む | 1              |
| `server/report/core/body/body-figure-fence.ts` | `toNumber`     | 引数   | 1   | 109    | 入口で畳む | 4              |
| `server/session-driver/core/pending-answer.ts` | `toPendingAsk` | 引数   | 1   | 196    | 入口で畳む | 1              |

### `src/shared/report`（消せる 8 件）

| ファイル                                   | 対象            | 置き場     | 件  | 行       | 消し方                               | 呼び出し側の数 |
| ------------------------------------------ | --------------- | ---------- | --- | -------- | ------------------------------------ | -------------- |
| `shared/report/graph-source.ts`            | `toneToken`     | 引数       | 1   | 358      | 入口で畳む                           | 1              |
| `shared/report/report-diagram-markdown.ts` | `toneAttribute` | 引数       | 1   | 403      | 入口で畳む                           | 2              |
| `shared/report/report-drawn-outline.ts`    | `drawnSection`  | 引数       | 1   | 108      | 入口で畳む                           | 3              |
| `shared/report/table-layout.ts`            | `isStatusCell`  | 引数       | 1   | 85       | 入口で畳む                           | 2              |
| `shared/report/timeline-scale.ts`          | `PlacedValue`   | プロパティ | 2   | 169・170 | 合併型（読めた値と読めなかった理由） | 1              |
| `shared/report/timeline-scale.ts`          | `uniqueReasons` | 引数       | 1   | 217      | 入口で畳む                           | 2              |
| `shared/report/timeline-scale.ts`          | `tickLabel`     | 引数       | 1   | 230      | 入口で畳む                           | 1              |

### `src/browser/domain`（消せる 2 件）

| ファイル                             | 対象                | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ------------------------------------ | ------------------- | ------ | --- | --- | ---------- | -------------- |
| `browser/domain/model-label.ts`      | `resolveShownModel` | 引数   | 1   | 44  | 入口で畳む | 1              |
| `browser/domain/reveal/brush-tip.ts` | `stanceOf`          | 引数   | 1   | 119 | 入口で畳む | 1              |

### `src/shared/character-pack`（消せる 2 件）

| ファイル                             | 対象                | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ------------------------------------ | ------------------- | ------ | --- | --- | ---------- | -------------- |
| `shared/character-pack/character.ts` | `backgroundWithUrl` | 引数   | 1   | 207 | 入口で畳む | 1              |
| `shared/character-pack/character.ts` | `portraitUrls`      | 引数   | 1   | 220 | 入口で畳む | 1              |

`CharacterInfo` の既定値を持つ欄の仕分け（`toCharacterInfo` で畳むか）。

| 欄       | 読み手の場所                                                                                  | 無いときの既定                                         | 畳めるか | 理由                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `name`   | `use-character-edit.ts`・`character-delete-band.ts`・`mini-portrait.tsx`                      | `pack`                                                 | 畳んだ   | 落とし先を `pack`（一覧の `label` と同じ落とし先）に決められた。`toCharacterInfo` で `string` にし、読み手の補いを消した    |
| `name`   | `portrait-appearance.ts`・`use-current-work.ts`・`use-achievement.ts`・`diary-writer.ts` ほか | `DEFAULT_CHARACTER_NAME`（`character` 自体が無いとき） | 残る     | 定義が届く前は `character` が無く畳み先が無い（R4）。`character` が有る名前の無いパックは `pack` の名前に変わる             |
| `accent` | `use-character-edit.ts`（`accentFallback`）・`use-pack-appearance.ts`                         | CSS の `--accent`                                      | 畳めない | 落とし先は CSS の `--accent` で、色をコードに書かない規約により畳み先が無い。無いことが `--accent` を外す意味を持つ（本物） |

### `src/browser/features`（消せる 4 件）

| ファイル                                                         | 対象                          | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| ---------------------------------------------------------------- | ----------------------------- | ------ | --- | --- | ---------- | -------------- |
| `browser/features/current-work/hooks/use-current-work.ts`        | `toSummaryView`               | 引数   | 1   | 373 | 入口で畳む | 1              |
| `browser/features/current-work/hooks/use-current-work.ts`        | `toPendingHintView`           | 引数   | 1   | 435 | 入口で畳む | 1              |
| `browser/features/run-setting/components/run-setting-option.tsx` | `permissionModeSelectOptions` | 引数   | 1   | 122 | 入口で畳む | 2              |
| `browser/features/task-board/domain/task-board-content.ts`       | `boardContent`                | 引数   | 1   | 75  | 入口で畳む | 1              |

### `src/server/report`（消せる 3 件）

| ファイル                                | 対象             | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| --------------------------------------- | ---------------- | ------ | --- | --- | ---------- | -------------- |
| `server/report/core/rules/structure.ts` | `referencesOf`   | 引数   | 1   | 192 | 入口で畳む | 1              |
| `server/report/core/rules/structure.ts` | `placementFault` | 引数   | 1   | 251 | 入口で畳む | 1              |
| `server/report/core/rules/structure.ts` | `isContainer`    | 引数   | 1   | 282 | 入口で畳む | 2              |

### `src/shared/session`（引数・プロパティは消し済み、残り 16 件は本物）

2026-11-06 の実物: 引数・プロパティの `| undefined` は消え、戻り値の 10 件（`grep -rn "| undefined" src/shared/session`、上限の表の `"src/shared/session": 10` と一致）と `SessionState` の `?:` 6 欄が残る。呼ぶ側のファイルを読んで、16 件とも本物とした。`SessionState` の 6 欄は、別々のイベントが別々に立て、同時に `undefined` になる組が無いので合併型には分けられない（`endedReason` は `session-ended` が立てるが、終わりの局面は `turn` が持つ）。

| ファイル                               | 対象                             | 判定 | 呼ぶ側の読んだファイル                                                                                                                      | 理由                                               |
| -------------------------------------- | -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `shared/session/session-id.ts:20`      | `parseSessionId`                 | R1   | `screen-part-example-nav.tsx`・`input-ledger-file.ts`・`sdk-message.ts`・`session-catalog.ts`                                               | 解析の失敗。呼び手がそれぞれ分岐する               |
| `shared/session/tool-use-id.ts:11`     | `parseToolUseId`                 | R1   | `sdk-stream-message.ts`・`sdk-background-message.ts`・`sdk-tool-result-message.ts`・`sdk-query-seed.ts`・`sdk-message.ts`                   | 解析の失敗                                         |
| `shared/session/work-plan.ts:194`      | `parseWorkPlan`                  | R1   | `sdk-message.ts`・`sdk-work-tool.ts`・`session-event-delegate.ts`・`work-plan.ts`                                                           | 検査を通らない引数の失敗                           |
| `shared/session/work-plan.ts:202`      | `parseWorkPlanCall`              | R1   | `work-plan-review.ts`                                                                                                                       | 同上。差し戻しに使う                               |
| `shared/session/work-plan.ts:328`      | `settleDelegatedRange`           | R4   | `work-plan-review.ts`                                                                                                                       | 範囲を確定できない状態を呼び手が別扱いする         |
| `shared/session/session-record.ts:76`  | `recordTimeAt`                   | R1   | `phase-duration.ts`・`turn-step.ts`・`turn-span.ts`・`clock-stamp.ts`・`chat-log.ts`・`work-activity.ts`                                    | 時刻が未確定の記録の読み取り。呼び手が `??` で畳む |
| `shared/session/shown-reaction.ts:80`  | `waitingLineDueAt`               | R1   | `report-tool.ts`・`waiting-line-alarm.ts`・`session-generation-start.ts`・`session-event-surrounding.ts`・`session-fold.ts`                 | 待ちの一言を出さない状態                           |
| `shared/session/model-name.ts:27`      | `findModelSupport`               | R1   | `effort-label.ts`                                                                                                                           | 探索の失敗                                         |
| `shared/session/work-plan-fold.ts:103` | `reportedPhaseOf`                | R1   | `work-plan-fold.ts`                                                                                                                         | 段の探索の失敗。「当たらない」で分岐する           |
| `shared/session/shown-reaction.ts:106` | `recordedReaction`               | R1   | `shown-reaction.ts`                                                                                                                         | 記録の探索の失敗。`??` で導出に落とす              |
| `shared/session/session-state.ts:81`   | `SessionState.model`             | R1   | `sdk-driver.ts`・`setting-mark-fold.ts`・`session-advance.ts`・`model-permission.ts`・`use-settings.ts`                                     | 選ばれる前の状態。立てるイベントが別               |
| `shared/session/session-state.ts:92`   | `SessionState.effort`            | R1   | `session-generation.ts`・`session-advance.ts`・`model-permission.ts`                                                                        | 同上                                               |
| `shared/session/session-state.ts:110`  | `SessionState.endedReason`       | R1   | `conversation-moment.ts`・`session-advance.ts`・`use-current-work.ts`・`current-turn-step-list.ts`・`use-turn-status.ts`・`use-composer.ts` | `session-ended` だけが立てる                       |
| `shared/session/session-state.ts:151`  | `SessionState.character`         | R1   | `event-judgement.ts`・`session-event-record.ts`・`remembered-default.ts`・`shown-reaction.ts`・`use-current-work.ts`・`use-diary-book.ts`   | キャラ選択前の状態                                 |
| `shared/session/session-state.ts:178`  | `SessionState.lastToolFailureAt` | R1   | `tool-record.ts`・`use-character-view.ts`・`portrait-motion.ts`                                                                             | 失敗が無い状態                                     |
| `shared/session/session-state.ts:210`  | `SessionState.plan`              | R1   | `session-advance.ts`・`use-token-usage.ts`                                                                                                  | 計画が出る前の状態                                 |

### `scripts/document`（消せる 1 件）

| ファイル                                | 対象          | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| --------------------------------------- | ------------- | ------ | --- | --- | ---------- | -------------- |
| `scripts/document/section-reference.ts` | `toReference` | 引数   | 1   | 229 | 入口で畳む | 2              |

### `src/server/chat`（消せる 3 件）

| ファイル                                        | 対象               | 置き場     | 件  | 行            | 消し方                                | 呼び出し側の数 |
| ----------------------------------------------- | ------------------ | ---------- | --- | ------------- | ------------------------------------- | -------------- |
| `server/chat/core/archive/chat-archive-port.ts` | `ChatArchiveEntry` | プロパティ | 3   | 143・145・161 | 画像の欄を1つの配列に畳む（0 枚は空） | 3              |

### `src/server/core`（消せる 1 件）

| ファイル                                | 対象                        | 置き場 | 件  | 行  | 消し方     | 呼び出し側の数 |
| --------------------------------------- | --------------------------- | ------ | --- | --- | ---------- | -------------- |
| `server/core/query/structured-query.ts` | `structuredQuery の settle` | 引数   | 1   | 213 | 入口で畳む | 1              |

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
| undefined を畳む: フックの書き込み判定 前半        | `scripts/hook`（`shell-write-rule.ts` の前半と、他の 2 ファイル）                                                    | 2          |                          |
| undefined を畳む: フックの書き込み判定 後半        | `scripts/hook`（`shell-write-rule.ts` の後半）                                                                       | 9          | 前半の後                 |
| undefined: ast-node の畳み方の優先を決める         | `scripts/shared`（`ast-node.ts` の方針。呼び出し側が広い）                                                           | （4）      | 実装の前                 |
| undefined を畳む: scripts/shared の判定関数        | `scripts/shared`（`ast-node.ts` 以外）                                                                               | 13         |                          |
| undefined を畳む: ast-node の4関数                 | `scripts/shared`（`ast-node.ts` の実装）                                                                             | 4          | 方針を決めるドラフトの後 |
| undefined を畳む: 撮影の道具の入口                 | `scripts/capture`                                                                                                    | 4          |                          |
| undefined を畳む: scripts/dev・document            | `scripts/dev`・`scripts/document`                                                                                    | 12         |                          |
| undefined を畳む: セッション駆動の読み取り         | `src/server/session-driver`                                                                                          | 5          |                          |
| undefined を畳む: 報告の記法まわり                 | `src/shared/report`                                                                                                  | 8          |                          |
| undefined を畳む: ブラウザ側の表示判定             | `src/browser/domain`                                                                                                 | 2          |                          |
| undefined を畳む: 現在の作業・設定・タスク盤       | `src/browser/features`                                                                                               | 4          |                          |
| undefined を畳む: 共有層のキャラ・セッション・診断 | `src/shared/character-pack`・`src/shared/session`・`src/shared/diagnostic`                                           | 8          |                          |
| undefined を畳む: サーバ側の小さな引数             | `src/server/chat`・`src/server/report`・`src/server/core`・`src/server/system-prompt`・`src/server/welcome-greeting` | 9          |                          |
| undefined を畳む: 起動依頼の chat と配信の版       | `src/server/session`・`src/(root)`                                                                                   | 2          |                          |

括弧なしの消せる件数の合計は 154 件で、領域の表の合計と一致する。`ast-node.ts` の 4 件は、方針を決めるドラフトでは括弧に入れ、実装のドラフトで数えた。

## `scripts/` の `?? ""` の仕分け（2026-11-06）

63 件を呼び出し側を読んで分け、消せる 6 件（`shell-write-rule.ts` の `directoryAfterUnsure`、`e2e-scenario.ts` の 4 件、`python-script-read.ts` の `findPythonScriptPaths`）を直した。残りは 57 件で、次の理由で本物として据え置く。

- `noUncheckedIndexedAccess` の穴埋め（`array[index] ?? ""`・`match[n] ?? ""`・`split(...)[0] ?? ""`・`node.textContent ?? ""`）。範囲の検査を済ませた添字・必ず参加する正規表現の群で、「無い」を運ぶ値ではない。`shell-command.ts`・`git-diff-output.ts`・`broad-kill.ts`・`git-subcommand.ts`・`document/` の各ファイルが当たる。
- 外の値の入口で「無い」を空の文字列として扱う（`queryGit(...) ?? ""`・`readText(...) ?? ""`・`values.tasks ?? ""`・`request.url ?? "/"` など）。読めなかったときに空の入力として先へ進めるのが、その呼び出し側の仕様。
- `stringField(...) ?? ""`（`export-symbol.ts`・`e2e-scenario.ts` の `templateHead`）と `getAttribute(...) ?? ""`（`reveal-snapshot.ts`）は、結果が文字列の値として使われ「無い」と「空」を区別しない。
- 文字列の連結・比較・ハッシュの入力に空を入れて先へ進める（`submodule-drift.ts`・`build-ui-skip.ts`・`shell-write-rule.ts`・`python-script-read.ts`・`foreign-restore.ts`・`hook-mode.ts`・`bash-hook-call.ts`・`ship.ts`・`feature-edge-table.ts`・`document-index.ts`・`document-index-repository.ts`・`e2e-selection.ts`・`repo-map.ts`）。「無い」が空の入力と同じ結果になるので、区別する値ではない。

### 63 件の仕分けの表

分類は A 穴埋め・B 外の値の入口・C 結果が文字列の値・D 連結や比較の入力・E 消せる。

| 件    | ファイル（行）                                              | 分類 |
| ----- | ----------------------------------------------------------- | ---- |
| 1     | `capture/mockup-font-floor.ts:60`                           | A    |
| 2     | `capture/open-room-grid.ts:122`（`method`）                 | B    |
| 3     | `capture/lib/reveal-snapshot.ts:55`                         | C    |
| 4     | `capture/lib/reveal-snapshot.ts:58`                         | C    |
| 5     | `capture/lib/reveal-snapshot.ts:59`                         | C    |
| 6     | `capture/lib/wrap-metric.ts:30`                             | A    |
| 7     | `capture/lib/text-length.ts:12`                             | A    |
| 8     | `shared/e2e-selection.ts:162`                               | D    |
| 9     | `shared/repo-map.ts:30`                                     | D    |
| 10    | `shared/e2e-scenario.ts:311`                                | C    |
| 11    | `shared/changed-path-repository.ts:17`                      | B    |
| 12    | `shared/changed-path-repository.ts:19`                      | B    |
| 13-15 | `shared/git-diff-output.ts:16,21,22`                        | A    |
| 16-17 | `shared/git-diff-output.ts:36,42`                           | A    |
| 18    | `shared/export-symbol.ts:43`                                | C    |
| 19    | `shared/replay-option.ts:20`                                | B    |
| 20    | `document/section-reference.ts:303`                         | A    |
| 21    | `document/feature-edge-table.ts:98`                         | D    |
| 22    | `document/task-mention.ts:240`                              | A    |
| 23-24 | `document/command-reference.ts:26,32`                       | A    |
| 25    | `document/undefined-audit-count.ts:122`                     | A    |
| 26    | `document/undefined-audit-count.ts:136`                     | A    |
| 27    | `document/document-index.ts:49`                             | D    |
| 28    | `document/document-index.ts:110`                            | A    |
| 29    | `document/lib/document-index-repository.ts:153`             | A    |
| 30    | `document/lib/document-index-repository.ts:154`             | D    |
| 31    | `document/closing-bold.ts:69`                               | A    |
| 32    | `dev/a2ui-write-trial.ts:105`                               | B    |
| 33    | `dev/ship.ts:334`                                           | D    |
| 34-35 | `dev/lib/expected-diff-repository.ts:18,20`                 | B    |
| 36    | `dev/lib/submodule-drift.ts:67`                             | D    |
| 37    | `dev/lib/submodule-drift.ts:126`                            | D    |
| 38    | `dev/lib/build-ui-skip.ts:47`                               | D    |
| 39    | `dev/lib/ship-queue.ts:156`                                 | B    |
| 40    | `dev/lib/ship-queue.ts:192`                                 | B    |
| 41    | `dev/lib/ship-queue.ts:204`                                 | B    |
| 42-43 | `hook/lib/git-subcommand.ts:14,15`                          | A    |
| 44    | `hook/lib/shell-write-rule.ts:360`                          | D    |
| 45    | `hook/lib/broad-kill.ts:86`                                 | A    |
| 46-47 | `hook/lib/broad-kill.ts:123,124`                            | A    |
| 48    | `hook/lib/foreign-restore.ts:54`                            | D    |
| 49    | `hook/lib/shell-command.ts:114`                             | A    |
| 50    | `hook/lib/shell-command.ts:187`                             | A    |
| 51    | `hook/lib/shell-command.ts:222`                             | A    |
| 52    | `hook/lib/shell-command.ts:319`                             | A    |
| 53    | `hook/lib/shell-command.ts:348`                             | A    |
| 54    | `hook/lib/shell-command.ts:397`                             | A    |
| 55    | `hook/lib/python-script-read.ts:135`                        | D    |
| 56    | `hook/lib/hook-mode.ts:13`                                  | D    |
| 57    | `hook/lib/bash-hook-call.ts:48`                             | D    |
| 58    | `hook/lib/shell-write-rule.ts` の `directoryAfterUnsure`    | E    |
| 59-62 | `shared/e2e-scenario.ts` の4件                              | E    |
| 63    | `hook/lib/python-script-read.ts` の `findPythonScriptPaths` | E    |

E は消せた 6 件（58・59-62・63）。直して消えたので行番号は今のコードに無い。A〜D は 57 件で、`git grep -o '?? ""' -- scripts` の実数（`python-script-read.ts` の 1 件を含めて 57 件）と一致する。

`workRoot` の `| undefined`・`?:`（`shell-write-rule.ts`・`python-script-read.ts`）は、遷移しない固定の入力なので合併型にしない。`WorkingDirectory` に畳んだのは、遷移して「根が決まらない」を運ぶ作業ディレクトリだけ。
