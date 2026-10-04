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

import type { SessionEvent } from "../session/session-event.ts"

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const DIAGNOSTIC_FORMAT_VERSION = 1 satisfies number

/** 足跡の1件（書き出す前。版を持たない）。`flow` が流れの判別子。 */
export type DiagnosticEntry = SessionEventFootprint

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
