// 仕事のときだけ載る `map_box` ツール。

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { readMapBox } from "../../../architecture-map/adapter/architecture-map-box.ts"
import { MAP_BOX_TOOL_NAME } from "../../../core/tsukumo-tool-name.ts"

const DESCRIPTION =
  "リポジトリの地図の箱の定義（置き場・ADR・つながり）を、箱の ID で引く。ID を省くと大・中の箱の一覧を返す。"

/** 作業ディレクトリの地図のファイルだけを読む。断るときは理由の固定の文面を `isError` 付きで返す。 */
export function mapBoxTool(cwd: string) {
  return tool(
    MAP_BOX_TOOL_NAME,
    DESCRIPTION,
    { id: z.string().optional().describe("箱の ID（別名でもよい）。省くと一覧") },
    async ({ id }) => {
      const read = await readMapBox(cwd, id)
      switch (read.kind) {
        case "absent":
          return refusal("地図のファイルがありません。")
        case "unreadable":
          return refusal(`地図のファイルを読めません（理由: ${read.reason}）。`)
        case "unknown-box":
          return refusal("その ID の箱は地図にありません。ID を省くと一覧を返します。")
        case "list":
        case "box":
          return { content: [{ type: "text" as const, text: JSON.stringify(read) }] }
      }
    },
  )
}

function refusal(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}
