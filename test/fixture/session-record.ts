// テストが使う、手で書いた架空の記録（`SessionRecord`）1件分の組み立て
// （docs/coding-standards.md「消すかどうか」の「同じモックの準備が複数ファイルに重複している →
// 準備を共通のフィクスチャに寄せる」）。形は `test/fixture/character.ts` の
// `characterInfo(overrides)` と同じ: 既定を1つ持ち、呼ぶ側は**違うところだけ**を渡す。
//
// **時刻は既定で {@link STAMPED}**（時刻に依らないテストの既定値）。時刻そのものを確かめる
// テストは `time` を上書きする。

import { type RecordTime, type SessionRecord } from "../../src/shared/session-state.ts"

/** 利用者の依頼1件。 */
export function requestRecord(
  overrides: Partial<Omit<Extract<SessionRecord, { readonly kind: "request" }>, "kind">> = {},
): SessionRecord {
  return {
    kind: "request",
    turnId: 0,
    text: "架空の依頼",
    images: [],
    time: STAMPED,
    ...overrides,
  }
}

/** キャラクターのセリフ1件。 */
export function speechRecord(
  overrides: Partial<Omit<Extract<SessionRecord, { readonly kind: "speech" }>, "kind">> = {},
): SessionRecord {
  return {
    kind: "speech",
    text: "架空のセリフ",
    expression: "default",
    time: STAMPED,
    ...overrides,
  }
}

/** ターンの本文（レポート）1件。 */
export function detailRecord(markdown = "架空のレポート"): SessionRecord {
  return { kind: "detail", markdown }
}

/** 圧縮の区切り。中身を持たない。 */
export function compactBoundaryRecord(): SessionRecord {
  return { kind: "compact-boundary" }
}

/** 時刻に依らないテストの記録に添える既定の時刻。 */
const STAMPED = { kind: "stamped", at: 0 } satisfies RecordTime
