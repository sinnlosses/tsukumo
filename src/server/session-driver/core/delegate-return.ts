// 委譲先の `SubagentHandback` の引数から、委譲の返却の段のまとめを読む。
// 返却の1行目の形は `/next-task` の委譲の依頼文が持つ。
// 読むのは1行目だけで、2行目より後ろは捨てる。

import { isPlainObject } from "remeda"

/** 委譲先が報告を返す Claude Code のツールの名前。 */
export const SUBAGENT_HANDBACK_TOOL_NAME = "SubagentHandback"

/**
 * 段を進める返却。`finishedPhase` は1行目の `n`（`計画 0/N` は 0）、`phaseCount` は `N`。
 * `summary` は1行目の `|` より後ろ（前後の空白を除く）で、空なら空の文字列。
 */
export type DelegateReturn = {
  readonly finishedPhase: number
  readonly phaseCount: number
  readonly summary: string
}

/**
 * `SubagentHandback` の引数の1行目が `段 n/N | 文` か `計画 0/N | 文` なら、段のまとめを返す。
 * `止めた n/N | 文`・形の読めない1行目・`message` の無い引数は undefined（段を進めない）。
 */
export function parseDelegateReturn(input: unknown): DelegateReturn | undefined {
  if (!isPlainObject(input) || typeof input.message !== "string") {
    return undefined
  }
  const matched = ADVANCING_FIRST_LINE.exec(input.message.split("\n", 1)[0] ?? "")
  if (matched === null) {
    return undefined
  }
  return {
    finishedPhase: Number(matched[1] ?? matched[2]),
    phaseCount: Number(matched[3]),
    summary: (matched[4] ?? "").trim(),
  }
}

const ADVANCING_FIRST_LINE = /^\s*(?:段 (\d+)|計画 (0))\/(\d+) \|(.*)$/
