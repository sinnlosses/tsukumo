// サーバからブラウザへ押すフレーム。**封筒（`type` と `protocolVersion`）だけを zod で見る**。
// 中身（`state` / `events`）は TS の型のままで、スキーマを二重に持たない
// ——状態にフィールドを1つ足すたびにスキーマも直す手間が、移行の各段で効いてくるため。
//
// 押す側（src/server/session/core/session-manager.ts）は型の付いた値を組み立てるだけなので、検証が要るのは
// 受け取る側（ブラウザ）の1箇所。
//
// **会話の内容がフレームに乗る**（`state` と `events`）。コマンドを断るときの理由
// （{@link FRAME_ERROR_REASON}）は定型文だけで、依頼の文面を含めない（docs/coding-standards.md
// 「会話内容の扱い」）。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { stampedEventSchema, type StampedEvent } from "./session-event.ts"
import { type SessionState } from "./session-state.ts"

/**
 * フレームと状態の版。**イベントの追加では上げない**（知らない `kind` は畳み込みが無視する）。
 * 既存のイベントの形・状態の形を変えたときだけ上げる（docs/design.md 4.5）。
 * 版が違うフレームを受け取ったブラウザは「ページを読み込み直してください」を出す。
 *
 * **コマンドの形を変えたときも上げる**——同じ `/ws` に乗るので、形の違うタブとプロセスの組は
 * コマンドが1件も通らなくなる（知らせで読み込み直してもらう）。
 *
 * 直近はフレームを購読の手続き（`frame.subscribe`）の Event Iterator で運ぶようにしたことで
 * 21 から 22 へ上げた（その前はコマンドを oRPC の手続きへ移して 20 から 21 へ）。**この変更を
 * またぐ組（古いタブと新しいプロセス、またはその逆）には `hello` が届かない**ので、版の知らせも
 * 出ない（画面が動かなくなるだけ）。上げ直したプロセスからページを読み込み直せば戻る。
 */
export const PROTOCOL_VERSION = 22

/**
 * 配っているものを取り直す先。`style` は CSS だけを取り直す（**開いているターンの選択も入力欄の
 * 文面も残る**）、`page` はページごと読み込み直す。
 */
export type RefreshTarget = "page" | "style"

/**
 * サーバ → ブラウザのフレーム。
 *
 * - `hello`: 購読ごとに最初の1回（と、起こし直したとき）。`state` は**サーバ側の畳み込みが持っている今の姿**
 * - `events`: 起きたイベントをまとめたもの（`src/server/session/core/session-manager.ts` が間引く）
 * - `refresh`: 配っているものを組み立て直したので取り直せ。**セッションとは無関係**で、
 *   `src/browser/` を見張っている開発中だけ届く（docs/design.md 11章）。会話の内容は乗らない
 */
export type ServerFrame =
  | {
      readonly type: "hello"
      readonly protocolVersion: number
      readonly state: SessionState
    }
  | { readonly type: "events"; readonly events: readonly StampedEvent[] }
  | { readonly type: "refresh"; readonly target: RefreshTarget }

/**
 * コマンドを受け付けられなかったときの理由。**定型文だけ**を並べ、依頼の文面や届いた値を
 * 混ぜない（docs/coding-standards.md「会話内容の扱い」）。旧の POST が返していた文言と揃えてある。
 * 返るのは手続きの応答のエラー（契約の `REFUSED`。`src/shared/command.ts`）で、画面は同じ文言を
 * 操作子を塞ぐときの説明にも使う。
 */
export const FRAME_ERROR_REASON = {
  unresolvedAnswer: "解決済み、または知らない答え待ち",
  driverFailed: "セッション駆動が受け付けなかった",
  characterEditFailed: "キャラクターの見た目を変えられなかった",
  characterCreateFailed: "キャラクターを作れなかった",
  characterDeleteFailed: "キャラクターを消せなかった",
  sessionDefaultFailed: "新しいセッションの既定を覚えられなかった",
  visitEnabledFailed: "訪問のオン・オフを切り替えられなかった",
  switchDuringTurn: "ターン進行中はキャラクターを切り替えられない（中断すると切り替えられる）",
  sessionSwitchDuringTurn: "ターン進行中はセッションを切り替えられない（中断すると切り替えられる）",
  chatModeSwitchDuringTurn:
    "ターン進行中は仕事と雑談を切り替えられない（中断すると切り替えられる）",
  nudgeDuringTurn: "ターン進行中は話しかけてもらえない（返事を待つ）",
  nudgeOutsideChat: "話しかけてもらえるのは雑談モードのときだけ",
  forgetRememberedLineFailed: "覚えたことを消せなかった",
  forgetRememberedLineOutsideChat: "覚えたことを消せるのは雑談モードのときだけ",
  usageProposalDismissFailed: "提案を見送れなかった",
  openFileFailed: "ファイルを開けなかった",
  achievementReflectionWriting:
    "いま日記を書いている最中は、ほかの日を振り返れない（書き終わると頼める）",
  achievementReflectionUnavailable: "その日の成果が読めない、または振り返る成果が無い",
} as const

/**
 * 受け取ったフレームの**封筒だけ**を確かめるスキーマ。`state` と `events[].event` は
 * 「オブジェクトであること」までしか見ない（上のコメントの決定）。
 */
export const serverFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    protocolVersion: z.number().int(),
    state: z.custom<SessionState>((value) => isPlainObject(value)),
  }),
  z.object({ type: z.literal("events"), events: z.array(stampedEventSchema) }),
  z.object({ type: z.literal("refresh"), target: z.enum(["page", "style"]) }),
])

/**
 * 届いた値をフレームとして受け取る。封筒が読めないときは undefined を返す
 * （ブラウザ側はそのフレームを捨てて次を待つ）。
 */
export function parseServerFrame(value: unknown): ServerFrame | undefined {
  const parsed = serverFrameSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
