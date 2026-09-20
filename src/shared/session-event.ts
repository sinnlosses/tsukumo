// セッションの中で起きた出来事（`SessionEvent`）の語彙。**サーバとブラウザの両方が読む契約**
// なので shared に置く（docs/design.md 4.1）。
//
// **ここは型だけ**で、SDK のメッセージからの変換は core（src/server/core/sdk-message.ts）にある
// （変換は SDK の形に結び付いた「外部由来の値の検証」なので、両側が共有する契約には入れない）。
//
// **`SessionEvent` の union は zod にしない**（2026-09-13 決定）。状態にフィールドを足すたびに
// スキーマを二重に直す手間が移行の各段で効いてくるため、型は TS のまま持ち、境界では
// {@link sessionEventSchema} の封筒（`kind` があること）だけを確かめる。
//
// **会話の内容がイベントに入る。** 外に出さない・複製しない・ログに出さない
// （docs/coding-standards.md「会話内容の扱い」）。

import { z } from "zod"

import { type CharacterInfo, type CharacterPackChoice } from "./character.ts"
import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-ask.ts"
import { type Question, type QuestionAnswer } from "./question.ts"
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
 * tsukumo 内部のイベント。SDK のメッセージ由来のものと、駆動側（src/server/adapter/sdk-driver.ts）が
 * 自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざる。
 * 受け取る側（src/shared/session-state.ts）はどちらから来たかを区別しない。
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
       * （docs/requirements.md 4.2「入力欄」。除く計算は
       * src/shared/command-suggestion.ts の `commandCandidates`）。SDK 側でフィールド自体が無いことがあるので、そのときは空配列。
       */
      readonly terminalSlashCommands: readonly string[]
    }
  /**
   * コマンドの説明が届いた。**名前の一覧（`session-info`）とは別の経路で来る**ので、別の
   * イベントにしてある（駆動側の `supportedCommands()` の結果と、`system` の
   * `commands_changed` の押し出しの両方がここに入る）。端末専用かどうかは分からないので、
   * 補完に出す/出さないの判断は名前の一覧の側が持つ（src/shared/command-suggestion.ts）。
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
  /** 答え待ちの列が変わった（積まれた・解決した）。中身は src/shared/pending-ask.ts が持つ。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  /**
   * 質問（`AskUserQuestion`）に利用者が答えた。**答えが確定した時点で1回だけ流す**
   * （2026-09-16 決定。docs/requirements.md 4.2「許可と質問」）。`pending-changed` は列が
   * 空になったことしか伝えないので、**「何を聞いて、どう答えたか」を残せるのはこの経路だけ**
   * （メインビューの質問の記録。`src/browser/features/main-view/question-record.tsx`）。
   *
   * `answers[i]` は `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}）。
   * **質問文も答えも会話の内容**なので、ログに出さない・外へ出さない。
   */
  | {
      readonly kind: "question-answered"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | { readonly kind: "turn-finished"; readonly status: TurnStatus }
  /**
   * `/clear` で会話が消された（SDK の `conversation_reset`。2026-09-15 実測）。**tsukumo は
   * `/clear` という文字列を見ていない。** `/` コマンドは依頼の文面としてそのまま本体へ渡り、
   * 本体が会話を捨てたときにこのメッセージを流してくる（`new_conversation_id` 付き。直後に
   * 新しい `session_id` の `system/init` が届く）。
   *
   * **`/compact` では流れない**（同じ実測で `system/status` + 同じ `session_id` の `init` だけ
   * だった）。要約は会話を消さないので、ここで拾う必要も無い。
   */
  | { readonly kind: "conversation-cleared" }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }
  /**
   * モデルが変わったことを、`session-info`（`init`）を待たずに先回りで伝える。出どころは2つ:
   *
   * 1. `/model` のローカルコマンドが実行された合図（`assistant` に乗る
   *    `local_command_run: { command: "model", args }`。2026-09-17 実測。`src/server/core/sdk-message.ts`）。
   *    `init` はターンの頭に届くので、`/model haiku` を送ったそのターンの `init` はまだ古い
   *    モデルを返す（正しい値が載るのは次の依頼の `init` から。docs/design.md 4.1）
   * 2. サイドバーの `<select>` からの `set-model` を駆動が確定させたとき
   *    （`src/server/adapter/sdk-driver.ts` の `setModel`）。**こちらは駆動が実際に切り替えたことを
   *    確認してから出すので、ブラウザ側のローカル echo ではない**（session-manager.ts が
   *    駆動を経ずにこのイベントを合成することはない。2026-09-17 実測: 本物の駆動は元々これを
   *    出しておらず、選んだ直後に次のイベントで古いモデルへ巻き戻って見えていた。偽の駆動
   *    （fake-driver.ts）は最初から出していたので気づけなかった）
   *
   * `model` はそのまま状態へ運ぶ値。1 のときは `/model` に渡した引数（前後の空白だけ除いてある）で
   * **エイリアスとして知っているかどうかの検証はしていない**。2 のときは `MODEL_ALIASES`
   * （src/shared/command.ts）の値そのもの。`MODEL_ALIASES` と完全一致するときだけ状態を
   * 更新する判断は畳み込み側（session-state.ts）が持つ（知らない値では状態を変えず、次の
   * `init` を待つだけにする。2026-09-17 決定）。
   */
  | { readonly kind: "model-changed"; readonly model: string }
  /**
   * develop/tasks.json が変わった（core の `task-summary.ts` が mtime を見て起こす）。
   * ファイルが読めない・消えたときは `tasks: undefined`（サイドバーの「不明」表示に対応する）。
   */
  | { readonly kind: "tasks-changed"; readonly tasks: readonly TaskSummaryItem[] | undefined }
  /**
   * キャラクターパックが決まった（core の `character-pack.ts`。**起こしたときと、
   * `switch-character` で起こし直したときの1回ずつ**）。キャラビューが立ち絵を取りに行く先
   * （`docs/design.md` 4.1・7章）。**中身は URL だけ**（素材そのものは乗らない。
   * docs/coding-standards.md「会話内容の扱い」と同じ考え方）。
   *
   * 切り替えの選択肢（`packs`）も一緒に運ぶ。**一覧は起動先とキャラクターパックの置き場を
   * 見て決まる**もので、いま出しているキャラクターと出どころが同じなので、イベントを分けない。
   */
  | ({ readonly kind: "character-changed" } & CharacterInfo & {
        readonly packs: readonly CharacterPackChoice[]
      })
  /**
   * 雑談モードに入っている／出ている（`docs/requirements.md` 4.9）。**駆動を起こしたときと、
   * `set-chat-mode` で起こし直したときの1回ずつ**流れる（`character-changed` と同じ契機）。
   *
   * 起こし直すと状態が初期値へ戻るので、**このイベントが無いと画面は雑談中かどうかを
   * 見失う**（`INITIAL_SESSION_STATE.chatMode` は `false`）。
   */
  | { readonly kind: "chat-mode-changed"; readonly chat: boolean }

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
 * zod で二重に持たない）。使うのは境界の2箇所だけ — フレームの読み取り（src/shared/frame.ts）と
 * 偽の駆動の台本（src/server/adapter/fake-driver.ts）。
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
