// ツールの記録（`SessionRecord` の `tool`）を、結果と背景の完了の知らせが届くたびに更新する畳み込み。

import { isPlainObject } from "remeda"

import type { ToolRunStatus } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"

type ToolResult = Extract<ToolRunStatus, { readonly kind: "finished" }>["result"]

/**
 * ツール1件の結果を記録に合わせる。対応する `tool_use` が見つからないときは何もしない（対応が取れない結果を作らない）。
 * `result` が `failed` のときは `lastToolFailureAt` に `at` を打つ。
 */
export function finishTool(
  state: SessionState,
  toolUseId: string,
  result: ToolResult,
  at: number,
): SessionState {
  const index = state.records.findIndex(
    (record) => record.kind === "tool" && record.toolUseId === toolUseId,
  )
  const record = index === -1 ? undefined : state.records[index]
  if (record === undefined || record.kind !== "tool") {
    return state
  }

  return {
    ...state,
    records: [
      ...state.records.slice(0, index),
      { ...record, status: { kind: "finished", finishedAt: { kind: "stamped", at }, result } },
      ...state.records.slice(index + 1),
    ],
    lastToolFailureAt: result.kind === "failed" ? at : state.lastToolFailureAt,
  }
}

/** `run_in_background` が true の Bash か（`input` は外来の値）。 */
export function runsInBackground(name: string, input: unknown): boolean {
  return name === "Bash" && isPlainObject(input) && input["run_in_background"] === true
}

/** 同じ `toolUseId` の記録が完了の知らせを待っていれば `notified` にする。前景の記録・知らない id・2回目の知らせでは姿を変えない。 */
export function notifyBackgroundEnd(
  state: SessionState,
  toolUseId: string,
  at: number,
): SessionState {
  const index = state.records.findIndex(
    (record) => record.kind === "tool" && record.toolUseId === toolUseId,
  )
  const record = index === -1 ? undefined : state.records[index]
  if (record === undefined || record.kind !== "tool" || record.backgroundEnd.kind !== "awaiting") {
    return state
  }

  return {
    ...state,
    records: [
      ...state.records.slice(0, index),
      { ...record, backgroundEnd: { kind: "notified", at: { kind: "stamped", at } } },
      ...state.records.slice(index + 1),
    ],
  }
}
