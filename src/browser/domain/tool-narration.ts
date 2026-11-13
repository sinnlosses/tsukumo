// ツール名＋入力から、いま何をしているかを言う1つの文にする。読む欄は要約（summarizeToolInput）と同じ1つだけ。

import { clipWithEllipsis } from "../../shared/utils/clip-text.ts"
import { MAX_TOOL_SUMMARY_LENGTH, summarizeToolInput, toolInputText } from "./tool-summary.ts"

type Narration = {
  readonly verb: string
  /** `fileName` は `file_path` の末尾の名前だけ、`value` は欄の値そのまま。 */
  readonly target: "fileName" | "value"
}

const NARRATION_BY_TOOL: Readonly<Record<string, Narration>> = {
  Read: { verb: "を読んでいる", target: "fileName" },
  Edit: { verb: "を直している", target: "fileName" },
  Write: { verb: "を書いている", target: "fileName" },
  Bash: { verb: "を走らせている", target: "value" },
  Grep: { verb: "を探している", target: "value" },
  Glob: { verb: "を探している", target: "value" },
  WebFetch: { verb: "を調べている", target: "value" },
  WebSearch: { verb: "を調べている", target: "value" },
  Agent: { verb: "を任せている", target: "value" },
  Task: { verb: "を任せている", target: "value" },
}

/**
 * ツール名＋入力から、動詞＋対象の文を返す。
 * 表に無い道具・入力がオブジェクトの形でない・欄が文字列でないときは undefined（呼ぶ側が今の出し方に落とす）。
 */
export function narrateToolUse(toolName: string, input: unknown): string | undefined {
  const narration = Object.hasOwn(NARRATION_BY_TOOL, toolName)
    ? NARRATION_BY_TOOL[toolName]
    : undefined
  if (narration === undefined) {
    return undefined
  }
  const full = toolInputText(toolName, input)
  if (full === "") {
    return undefined
  }
  const target =
    narration.target === "fileName"
      ? clipWithEllipsis(
          full.split(/[\\/]/).findLast((s) => s !== "") ?? full,
          MAX_TOOL_SUMMARY_LENGTH,
        )
      : summarizeToolInput(toolName, input)
  return `${target}${narration.verb}`
}
