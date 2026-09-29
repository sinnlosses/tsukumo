// テストが使う、手で書いた架空の記録（`SessionRecord`）1件分の組み立て
// （docs/coding-standards.md「消すかどうか」の「同じモックの準備が複数ファイルに重複している →
// 準備を共通のフィクスチャに寄せる」）。形は架空のキャラクター定義の
// `characterInfo(overrides)` と同じ: 既定を1つ持ち、呼ぶ側は違うところだけを渡す。
//
// 時刻は既定で `STAMPED`（時刻に依らないテストの既定値）。時刻そのものを確かめる
// テストは `time` を上書きする。

import type {
  RecordTime,
  SessionRecord,
  ToolRunStatus,
} from "../../src/shared/session/session-state.ts"

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

/**
 * `report` ツールで受け取ったレポート1件。本文は `conclusion` にだけ置く（`body` は描くときに
 * 整形が掛かるので、渡した文字列がそのまま出るほうを既定にする）。
 */
export function reportRecord(conclusion = "架空の結論"): SessionRecord {
  return { kind: "report", conclusion, sections: [], favor: "", checks: [], task: { kind: "none" } }
}

/** `work_plan` で受け取った段取り1件。 */
export function workPlanRecord(
  overrides: Partial<Omit<Extract<SessionRecord, { readonly kind: "work-plan" }>, "kind">> = {},
): SessionRecord {
  return { kind: "work-plan", phases: ["架空の段A", "架空の段B"], current: 0, ...overrides }
}

/** 圧縮の区切り。中身を持たない。 */
export function compactBoundaryRecord(): SessionRecord {
  return { kind: "compact-boundary" }
}

/** ツール呼び出し1件。既定は実行中（結果がまだ届いていない）。 */
export function toolRecord(
  overrides: Partial<Omit<Extract<SessionRecord, { readonly kind: "tool" }>, "kind">> = {},
): SessionRecord {
  return {
    kind: "tool",
    toolUseId: "toolu_dummy",
    name: "Bash",
    input: { command: "架空のコマンド" },
    nested: false,
    startedAt: STAMPED,
    status: { kind: "running" },
    ...overrides,
  }
}

/** 時刻に依らないテストの記録に添える既定の時刻。 */
const STAMPED = { kind: "stamped", at: 0 } satisfies RecordTime

/** 終わったツールの `status`。所要時間を確かめるテストでは `finishedAt` を渡し直す。 */
export function finishedToolStatus(
  overrides: Partial<Omit<Extract<ToolRunStatus, { readonly kind: "finished" }>, "kind">> = {},
): Extract<ToolRunStatus, { readonly kind: "finished" }> {
  return {
    kind: "finished",
    finishedAt: STAMPED,
    result: { content: "ok", isError: false },
    ...overrides,
  }
}
