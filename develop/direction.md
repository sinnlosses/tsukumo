# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- **改修コストを下げる直し9件をすべてタスクにする**（2026-09-24 に `/simplify` の4観点（再利用・単純化・効率・根本対処）でリポジトリ全体を洗った結果。7 と 9 は指摘を受けただけで裏取りしていないので、**`/plan-tasks` のときに調べてから入れ方を決める**）
  1. 帯のモデル・許可モードの既定値（`src/browser/features/screen-nav/domain/model-label.ts` の `MODEL_FALLBACK`、`permission-mode-label.ts` の `PERMISSION_MODE_FALLBACK`）を `src/shared/session-default.ts` の `BUILTIN_SESSION_DEFAULT` から読む。コメントが指す `session-driver.ts` の `DEFAULT_MODEL` / `DEFAULT_PERMISSION_MODE` はもう無い。どこからも呼ばれていない `modelLabel` / `permissionModeLabel` も消す
  2. `src/shared/session-state.ts` の `character-changed` の畳み込みで `CharacterInfo` の13項目を手で写すのをやめ、`kind` と `packs` を除いてそのまま展開する（いまは項目を足しても型エラーにならず、黙って抜け落ちる）
  3. `src/server/adapter/character-edit.ts` の画像の差し替え・消去（`set-portrait` / `set-background` / `clear-portrait` / `clear-background`）で4つの枝が同じ手順を書き写しているのを1つにまとめる。`character-edit.ts` と `character-pack.ts` に同じものがある `readOptionalFile` も1つにする
  4. 画面を1枚足すたびに触る4箇所（`src/browser/stores/location-hash.ts` の `SCREENS` と表示名の表、`src/browser/features/screen-nav/hooks/use-screen-nav.ts` の帯のメニュー、`src/browser/main.tsx` の import と分岐）を、`{ screen, label, Component }` の1つの表から導く
  5. `typeof value === "string" ? value : undefined` の6箇所（`src/server/core/sdk-message.ts`、`src/server/adapter/claude-account.ts`、`src/shared/task-summary.ts`、`src/shared/character-definition.ts`、`src/browser/features/main-view/markdown/markdown.tsx`、`src/browser/lib/tool-summary.ts`）を `src/shared/` の1つの関数に寄せる
  6. 字句がまったく同じ重複4組を消す: `clamp`（`src/browser/features/main-view/reveal/paint.ts` と `band.ts`）、`fetchTokenUsageSummary`（`src/browser/features/token-usage/hooks/use-token-usage.ts` と `use-usage-review.ts`）、`run()`（`scripts/lib/port-listener.ts` と `scripts/open-room-grid.ts`）、`src/server/adapter/claude-account.ts` の `JSON.parse(readFileSync(...))` の手書き（`src/server/adapter/lib/json-file.ts` の `readJsonFile` に寄せる）
  7. **（要調査）** `src/server/adapter/repository-file.ts` の git 呼び出しを `src/server/adapter/git.ts` の `runGit` に寄せ、`test/architecture.test.ts` で `node:child_process` を使ってよいファイルを1つ減らす
  8. `src/server/adapter/main-history.ts` の成果の集計で、互いに依存しない git 呼び出し2組（今日と昨日の切り口、今日と昨日のタスクの読み取り）を `Promise.all` で同時に走らせる（今日を見ているあいだは60秒ごとに走る）
  9. **（要調査）** テストの固定時間の `setTimeout`（指摘では約13ファイル・合計約3秒。多いのは `test/server/adapter/task-summary.test.ts`、`test/browser/features/character-screen/use-character-edit.test.tsx`）を、条件が満たされるまで待つ形に揃える。`bun run check` の所要時間がどれだけ縮むかを先に測る
  - 見送ったもの: レポートの記法と `sanitize-schema.ts` の同期（`test/server/core/report-notation.test.ts` がすでに突き合わせている）、browser の `fetch` → `response.ok` → `readX(json)` 5箇所の共通化（失敗したときの扱いが3通りに分かれていて、まとめても引数が増えるだけ）

## エージェントのドラフト

- **新しい合図やターンの扱いを足すタスクは、同じ SDK の出来事を起こす経路をすべて挙げてから頻度を仮定する**（振り返り: T-448, T-475, 2026-09-24 の修正 7b06eec3・1cdf60fd）
  - 根拠: T-448 は続きのターン（ターンの外の `init`）を「背景のタスクが終わった知らせ」の1経路・委譲1回につき1回と見て、吹き出しを空にする仕様を書いた（`docs/screen-design.md` 13.9）。一方、T-157 以来 `speech-cadence.ts` は委譲中に `SendMessage` の合図を送らせていて、実際には委譲1回で3回（合図2通と完了の返事）起きた。その結果、中間レポートが消えては出直し、吹き出しが「（まだ発話がありません）」に戻った
  - 出し先: `plan-tasks` でタスクを書くときの上乗せ（`docs/workflow.md`）に「イベントを足す・扱いを変えるタスクは、そのイベントを起こす経路を本文に列挙する」を足す
- **「同じやり取りの中で一度出たものは消えない」を、イベントを1件ずつ畳みながら確かめるテストにする**（振り返り: T-448, T-475）
  - 根拠: `docs/display.md` 4.2 に「一度出した本文は二度と消えない」と書いてあるのに、それを守るテストが無かった。`mainViewTurns` のテストは `turnUnsettled` に真偽値を直に渡すだけで、イベント列から畳むテストは0件だった。`test/shared/session-state.test.ts` は「続きのターンは吹き出しを空にする」を期待値にしていて、誤った仕様を守っていた。2026-09-24 に足した3件（`test/browser/stores/main-view-turn.test.ts`）も最後の姿しか見ていない
  - 出し先: タスク。続きのターンを2回以上含む現実の並び（依頼 → 中間 report → 合図 → 合図 → 完了の返事 → 最終 report）を1件ずつ畳み、毎回「出ていた report が消えない」「吹き出しが空に戻らない」を確かめるテストを足す
- **疑似セッションに、合図つきの委譲の場面を足す**（振り返り: T-448）
  - 根拠: `test/fixture/fake-session.json` の `background-task` の場面は、続きのターンが1回だけで `report` も無い。吹き出しも空になって0.4秒後に次のセリフで埋まるので、目視（`docs/architecture.md`「手で確かめること」）でも2つの不具合が見えなかった
  - 出し先: タスク。中間 report → 合図2通（それぞれ `turn-resumed` → `speech` → 終わり）→ 完了の返事 → 最終 report の場面を足し、目視の手順から引けるようにする
