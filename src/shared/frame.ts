// サーバからブラウザへ押すフレーム。
// 封筒（`type` と `protocolVersion`）だけを zod で見る。
// 中身（`state` / `events`）は TS の型のままで、スキーマを二重に持たない。
// 押す側は型の付いた値を組み立てるだけなので、検証が要るのは受け取る側（ブラウザ）の1箇所。

import { isPlainObject } from "remeda"
import { z } from "zod"

import { isSessionEventKind } from "./session/session-event-kind.ts"
import { stampedEventSchema, type StampedEvent } from "./session/session-event.ts"
import type { SessionState } from "./session/session-state.ts"

/**
 * フレームと状態の版。
 * イベントの追加では上げない（知らない `kind` は畳み込みが無視する）。
 * 既存のイベントの形・状態の形を変えたときだけ上げる。
 * 版が違うフレームを受け取ったブラウザは「ページを読み込み直してください」を出す。
 *
 * コマンドの形を変えたときも上げる。
 * 同じ `/ws` に乗るので、形の違うタブとプロセスの組はコマンドが1件も通らなくなる（知らせで読み込み直してもらう）。
 */
export const PROTOCOL_VERSION = 71

/**
 * 配っているものを取り直す先。
 * `style` は CSS だけを取り直し（開いているターンの選択も入力欄の文面も残る）、`page` はページごと読み込み直す。
 */
export type RefreshTarget = "page" | "style"

/**
 * サーバ → ブラウザのフレーム。
 *
 * - `hello`: 購読ごとに最初の1回（と、起こし直したとき）。`state` はサーバ側の畳み込みが持っている今の姿
 * - `events`: 起きたイベントを、間引いてまとめたもの
 * - `refresh`: 配っているものを組み立て直したので取り直せ。
 *   セッションとは無関係で、`src/browser/` を見張っている開発中だけ届く。会話の内容は乗らない
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
 * 受け取ったフレームの封筒だけを確かめるスキーマ。`state` と `events[].event` は「オブジェクトであること」までしか見ない。
 * 事前条件: 送り手は同じビルドのサーバで、`state` は `SessionState`、`event` は `SessionEvent` の形を守る。
 * 版の違う送り手は `protocolVersion` で見分ける。中身の欄が壊れていても、ここでは見分けない。
 */
const serverFrameSchema = z.discriminatedUnion("type", [
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
  if (!parsed.success) return undefined
  const frame = parsed.data
  if (frame.type !== "events") return frame
  return {
    type: "events",
    events: frame.events.filter(({ event }) => isSessionEventKind(event.kind)),
  }
}
