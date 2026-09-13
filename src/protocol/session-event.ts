// セッションの中で起きた出来事（`SessionEvent`）の語彙。**サーバとブラウザの両方が読む契約**
// なので protocol に置く（docs/design.md 4.1）。
//
// **ここは型だけ**で、SDK のメッセージからの変換は core（src/core/sdk-message.ts）にある
// （変換は SDK の形に結び付いた「外部由来の値の検証」なので、両側が共有する契約には入れない）。
//
// **`SessionEvent` の union は zod にしない**（2026-09-13 決定）。状態にフィールドを足すたびに
// スキーマを二重に直す手間が移行の各段で効いてくるため、型は TS のまま持ち、境界では
// {@link sessionEventSchema} の封筒（`kind` があること）だけを確かめる。
//
// **会話の内容がイベントに入る。** 外に出さない・複製しない・ログに出さない
// （docs/coding-standards.md「会話内容の扱い」）。

import { z } from "zod"

import { type CharacterInfo } from "./character.ts"
import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type TaskSummaryItem } from "./task-summary.ts"

/** ターンの終わり方。`result` の subtype が `success` 以外はすべて `error` に倒す。 */
export type TurnStatus = "success" | "error"

/**
 * `/` 補完に出すコマンド1件。**説明は SDK 側が持っている**（`init` の `slash_commands` は
 * 名前だけだが、駆動側の `supportedCommands()` と `system` の `commands_changed` が名前と説明の
 * 組を返す。2026-09-12 調査）。組み込みコマンドも含めて説明が付くので、tsukumo 側に説明の表を
 * 持たない。説明が空文字のコマンドは `undefined` に倒す（名前だけ出す）。
 */
export type CommandDescription = {
  readonly name: string
  readonly description: string | undefined
}

/**
 * tsukumo 内部のイベント。SDK のメッセージ由来のものと、駆動側（src/core/session-driver.ts）が
 * 自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざる。
 * 受け取る側（src/protocol/session-state.ts）はどちらから来たかを区別しない。
 *
 * **未知の `kind` で落ちない**（畳み込みは知らない種別を無視する）ので、イベントを足しても
 * `PROTOCOL_VERSION` は上げない（docs/design.md 4.5）。
 */
export type SessionEvent =
  /**
   * `system` の `init`。**プロンプトを送るたびに届く**ので「新しいセッション」の合図にしない
   * （2026-09-11 実測。docs/requirements.md 4.1）。`slashCommands` / `terminalSlashCommands` は
   * 毎回上書きでよい。
   */
  | {
      readonly kind: "session-info"
      readonly sessionId: string
      readonly model: string | undefined
      readonly permissionMode: string | undefined
      readonly slashCommands: readonly string[]
      /**
       * `slash_commands` のうち、端末専用（UX が端末に結び付く。`doctor` / `color` /
       * `reload-plugins` など）のもの。**入力欄の補完からは除く**
       * （docs/requirements.md 4.2「入力欄」。除く計算は src/protocol/session-state.ts の
       * `commandCandidates`）。SDK 側でフィールド自体が無いことがあるので、そのときは空配列。
       */
      readonly terminalSlashCommands: readonly string[]
    }
  /**
   * コマンドの説明が届いた。**名前の一覧（`session-info`）とは別の経路で来る**ので、別の
   * イベントにしてある（駆動側の `supportedCommands()` の結果と、`system` の
   * `commands_changed` の押し出しの両方がここに入る）。端末専用かどうかは分からないので、
   * 補完に出す/出さないの判断は名前の一覧の側が持つ（src/protocol/session-state.ts）。
   */
  | {
      readonly kind: "command-descriptions"
      readonly descriptions: readonly CommandDescription[]
    }
  /** 利用者が送った依頼。ターンの境目になる（駆動側が送信時に起こす）。 */
  | { readonly kind: "request"; readonly text: string }
  /** 書きかけのターンの本文。完成した本文が来るまでの**仮**（docs/requirements.md 4.2）。 */
  | { readonly kind: "partial-utterance"; readonly text: string }
  /** 完成したターンの本文。仮の本文を置き換える。 */
  | { readonly kind: "utterance"; readonly text: string }
  /** `speak` ツールの呼び出し。セリフと表情（docs/glossary.md「セリフ」「表情」）。 */
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  | {
      readonly kind: "tool-started"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      /**
       * サブエージェントの中で動いたときの、起こした側の Agent ツールの `toolUseId`。
       * トップレベルのターンでは undefined（SDK メッセージの `parent_tool_use_id` が `null`）。
       */
      readonly parentToolUseId: string | undefined
    }
  | {
      readonly kind: "tool-finished"
      readonly toolUseId: string
      readonly content: string
      readonly isError: boolean
    }
  /** 答え待ちの列が変わった（積まれた・解決した）。中身は src/protocol/pending-ask.ts が持つ。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  | { readonly kind: "turn-finished"; readonly status: TurnStatus }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }
  /**
   * develop/tasks.json が変わった（core の `task-summary.ts` が mtime を見て起こす）。
   * ファイルが読めない・消えたときは `tasks: undefined`（サイドバーの「不明」表示に対応する）。
   */
  | { readonly kind: "tasks-changed"; readonly tasks: readonly TaskSummaryItem[] | undefined }
  /**
   * キャラクターパックが決まった（core の `character-pack.ts` が起動時に1回だけ流す）。
   * キャラビューが立ち絵を取りに行く先（`docs/design.md` 4.1・7章）。**中身は URL だけ**
   * （素材そのものは乗らない。docs/coding-standards.md「会話内容の扱い」と同じ考え方）。
   */
  | ({ readonly kind: "character-changed" } & CharacterInfo)

/**
 * 時刻を打ったイベント1件。**時刻はイベントの発生側（サーバ）が決める**（ブラウザ側で
 * `Date.now()` を畳み込みに渡さない。docs/design.md 4.1）。
 */
export type StampedEvent = {
  readonly at: number
  readonly event: SessionEvent
}

/**
 * 外から届いた値を {@link SessionEvent} として受け取るための**封筒だけ**のスキーマ
 * （`kind` を持つオブジェクトであること）。**中身は検証しない**（2026-09-13 決定。union を
 * zod で二重に持たない）。使うのは境界の2箇所だけ — フレームの読み取り（src/protocol/frame.ts）と
 * 偽の駆動の台本（src/core/fake-driver.ts）。
 */
export const sessionEventSchema = z.custom<SessionEvent>(
  (value) => isRecord(value) && typeof value.kind === "string",
)

/** 時刻付きイベントのスキーマ。`at` だけを確かめ、イベントの中身は封筒どまり。 */
export const stampedEventSchema = z.object({
  at: z.number(),
  event: sessionEventSchema,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
