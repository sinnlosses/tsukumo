// セッション駆動の契約（docs/glossary.md「セッション駆動」）。**ここにあるのは型と既定値だけ**で、
// 実際に何かを起こすコードは持たない。実装は2つあり、どちらも `src/adapter/` にある
// （Agent SDK の `sdk-driver.ts` と、台本を流す `fake-driver.ts`）。
//
// 契約をここに置いてあるので、`session-manager` は駆動の実装を import せずに済む
// （どちらが動いているかを知らない。docs/design.md 5章）。
//
// **境目の基準は「protocol の語彙で書けるか / SDK の語彙を名乗るか」**。protocol の語彙だけで
// 書けるもの（契約の型・`DEFAULT_PERMISSION_MODE` / `DEFAULT_MODEL`）はここに、SDK の語彙を
// 名乗るもの（`DEFAULT_EFFORT` の `EffortLevel`、`query()` の options、`listSessions` /
// `getSessionMessages` を使う関数）は `src/adapter/sdk-driver.ts` に置く。

import { type ExpressionChoice } from "../protocol/character.ts"
import { type ModelAlias, type PermissionMode } from "../protocol/command.ts"
import { type Answer, type PendingAsk } from "../protocol/pending-ask.ts"
import { type SessionEvent } from "../protocol/session-event.ts"

/**
 * 既定の許可モード。`auto` は Claude Code 側が読み取り専用の操作を自動で通し、書き込みなどは
 * `canUseTool` に回す（2026-09-11 実測。docs/requirements.md 4.1）。
 *
 * **許可モードとモデルの値の一覧そのものは protocol にある**（`src/protocol/command.ts` の
 * `PERMISSION_MODES` / `MODEL_ALIASES`。docs/design.md 4.3）。SDK の型と同じ値であることは
 * test/adapter/sdk-driver.test.ts が型で確かめる。
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = "auto"

/**
 * 既定のモデル。ユーザーの指示（2026-09-12）で Opus に固定した
 * （docs/requirements.md 4.1）。画面の `<select>` 側の見た目上の既定値
 * （`src/ui/sidebar/session-info.tsx` の `MODEL_FALLBACK`）も同じ値に揃える。
 */
export const DEFAULT_MODEL: ModelAlias = "opus"

export type SessionDriverOptions = {
  /** セッションの作業ディレクトリ。 */
  readonly cwd: string
  /** `speak` の `expression` で受け付ける表情と、そのラベル（キャラクターパックから作る）。 */
  readonly expressions: readonly ExpressionChoice[]
  readonly permissionMode: PermissionMode
  /**
   * `systemPrompt` に足す文字列（人格とレポートの記法。組み立ては
   * `src/adapter/character-pack.ts` の `buildSystemPromptAppend`）。**中身をこのファイルが
   * 決めない**（docs/design.md 5章）。
   */
  readonly systemPromptAppend: string
  /**
   * 続きから始めるセッションのID（undefined なら新規に起こす。docs/requirements.md 4.8）。
   * 選ぶのは `src/adapter/sdk-driver.ts` の `findSessionToResume`。
   */
  readonly resume: string | undefined
  /**
   * このセッションに付ける印（組み立ては `src/core/config.ts` の `sessionTag`。キャラクター
   * パックごとに違う）。**ターンが終わるたびに付け直す**（次に起こしたときに、これでそのパックの
   * セッションだけを見分ける。付け直す理由は `src/adapter/sdk-driver.ts` の
   * `SESSION_TAG_DELAY_MS`）。
   */
  readonly tag: string
  /** 内部イベントの受け取り口。**ここで例外を投げないこと**（投げるとセッションが終わる）。 */
  readonly onEvent: (event: SessionEvent) => void
}

export type SessionDriver = {
  /** 依頼を1つ送る（ストリーミング入力への追加）。`request` イベントも同時に流れる。 */
  readonly prompt: (text: string) => void
  /** 実行中のターンを中断する。中断されたターンは `turn-finished` の `error` で終わる。 */
  readonly interrupt: () => Promise<void>
  /** 答え待ちに答える。解決済み・知らない id のときは `false`。 */
  readonly answer: (id: string, answer: Answer) => boolean
  /** いまの答え待ち（画面を組み直すときに使う）。 */
  readonly pending: () => readonly PendingAsk[]
  /** モデルを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setModel: (model: string | undefined) => Promise<void>
  /** 許可モードを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setPermissionMode: (mode: PermissionMode) => Promise<void>
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}
