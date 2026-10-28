// 仕事のときだけ載る `report_part_card` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { PART_CARD_TOOL_NAME } from "../../core/tsukumo-tool-name.ts"
import {
  PART_CARD_COMPONENT_DESCRIPTION,
  PART_CARD_TOOL_DESCRIPTION,
  partCardOf,
} from "../../report/core/part-card.ts"

/** 部品の名前を受けて、その部品の文法カードを返すツール。知らない名前は、引ける名前の一覧を `isError` 付きで返す。 */
export function partCardTool() {
  return tool(
    PART_CARD_TOOL_NAME,
    PART_CARD_TOOL_DESCRIPTION,
    { component: z.string().describe(PART_CARD_COMPONENT_DESCRIPTION) },
    async ({ component }) => {
      const card = partCardOf(component)
      return {
        content: [{ type: "text" as const, text: card.text }],
        isError: card.kind === "unknown-component",
      }
    },
  )
}
