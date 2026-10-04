// 診断ログの1行の形（型だけ）。不具合の経緯を手元で追うための足跡で、外へは送らない。
//
// この記録に書いてよいもの:
//
// - 数（時刻・駆動の代）
// - 決まった語（リテラルの合併。イベントの種類の名前など）
//
// 書かないもの:
//
// - 依頼の文面・セリフ・レポート・ツールの引数と結果・エラーのメッセージは1文字も入らない。
//   どの欄にも任意の文字列を受ける型を置かないことで、あとから足せないようにしてある

import { z } from "zod"

import type { SessionEvent } from "../session/session-event.ts"
import type { SwallowedFailureFootprint } from "./swallowed-failure.ts"

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const DIAGNOSTIC_FORMAT_VERSION = 1 satisfies number

/** 足跡の1件（書き出す前。版を持たない）。`flow` が流れの判別子。 */
export type DiagnosticEntry =
  | SessionEventFootprint
  | BrowserErrorFootprint
  | SwallowedFailureFootprint
  | PromptDelayFootprint

/** JSONL に書く1行の形。 */
export type DiagnosticRecord = DiagnosticEntry & {
  readonly v: typeof DIAGNOSTIC_FORMAT_VERSION
}

/** 駆動から届いた `SessionEvent` を1件畳んだこと。中身は持たない。 */
export type SessionEventFootprint = {
  readonly flow: "session-event"
  /** 畳んだ時刻（エポックミリ秒）。 */
  readonly at: number
  /** そのイベントを生んだ駆動が、プロセスを起こしてから何代目か（1から）。 */
  readonly generation: number
  readonly kind: SessionEvent["kind"]
}

/** 依頼を SDK へ渡してから本体が受け取るまでが遅れたこと。区間のミリ秒だけを持つ。 */
export type PromptDelayFootprint = {
  readonly flow: "prompt-delay"
  /** 本体から最初のメッセージを受けた時刻（エポックミリ秒）。 */
  readonly at: number
  /** 依頼を SDK へ渡した時刻（エポックミリ秒）。 */
  readonly pushedAt: number
  /** 渡してから SDK が書き終えるまで。 */
  readonly writeMs: number
  /** 書き終えてから本体の最初のメッセージが届くまで。 */
  readonly replyMs: number
}

/** ブラウザの例外を拾った経路。 */
export const BROWSER_ERROR_ROUTES = ["onerror", "unhandledrejection", "render-failure"] as const
export type BrowserErrorRoute = (typeof BROWSER_ERROR_ROUTES)[number]

/** `error.name` の既知の名前。知らない名前は `"other"` に写す。 */
export const BROWSER_ERROR_NAMES = [
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "EvalError",
  "URIError",
  "other",
] as const
export type BrowserErrorName = (typeof BROWSER_ERROR_NAMES)[number]

/** スタックの1フレームの出どころ。ファイル名は運ばず、ページと同じオリジンかどうかだけに写す。 */
export const BROWSER_ERROR_ORIGINS = ["bundle", "other"] as const
export type BrowserErrorOrigin = (typeof BROWSER_ERROR_ORIGINS)[number]

/** 運ぶスタックフレームの数の上限。 */
export const DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES = 5

/** 行・列の数の上限。 */
export const DIAGNOSTIC_BROWSER_ERROR_MAX_POSITION = 10_000_000

const browserErrorPositionSchema = z
  .number()
  .int()
  .min(0)
  .max(DIAGNOSTIC_BROWSER_ERROR_MAX_POSITION)

export const browserErrorFrameSchema = z.object({
  origin: z.enum(BROWSER_ERROR_ORIGINS),
  line: browserErrorPositionSchema,
  column: browserErrorPositionSchema,
})

/** スタックの1フレーム。ファイル名ではなく、出どころ（閉じた合併）と行・列の数だけを持つ。 */
export type BrowserErrorFrame = z.infer<typeof browserErrorFrameSchema>

export const browserErrorReportSchema = z.object({
  route: z.enum(BROWSER_ERROR_ROUTES),
  errorName: z.enum(BROWSER_ERROR_NAMES),
  frames: z.array(browserErrorFrameSchema).max(DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES).readonly(),
})

/** ブラウザが運ぶ、例外1件の中身（経路・`error.name`・スタックの先頭数フレーム）。 */
export type BrowserErrorReport = z.infer<typeof browserErrorReportSchema>

/** ブラウザの例外を1件畳んだこと。 */
export type BrowserErrorFootprint = BrowserErrorReport & {
  readonly flow: "browser-error"
  /** 畳んだ時刻（エポックミリ秒）。 */
  readonly at: number
}

/** 外から届いた `error.name` を、既知の名前の合併（知らなければ `"other"`）に写す。 */
export function toBrowserErrorName(name: string | undefined): BrowserErrorName {
  return name !== undefined && isBrowserErrorName(name) ? name : "other"
}

function isBrowserErrorName(value: string): value is BrowserErrorName {
  return (BROWSER_ERROR_NAMES as readonly string[]).includes(value)
}
