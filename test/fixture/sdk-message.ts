// SDK が transcript に残すメッセージの形を、手で組み立てる。中身は呼ぶテストが渡す架空のもの。

import {
  REPORT_TOOL_NAME,
  SPEAK_TOOL_NAME,
  TSUKUMO_MCP_SERVER_NAME,
} from "../../src/server/session-driver/core/sdk-message.ts"

/** SDK から見た `speak` / `report` の名前（MCP のサーバ名が前に付く）。 */
export const SPEAK_TOOL_FULL_NAME = `mcp__${TSUKUMO_MCP_SERVER_NAME}__${SPEAK_TOOL_NAME}`
export const REPORT_TOOL_FULL_NAME = `mcp__${TSUKUMO_MCP_SERVER_NAME}__${REPORT_TOOL_NAME}`

export function userMessage(content: unknown): unknown {
  return {
    type: "user",
    uuid: "u-1",
    session_id: "s-1",
    message: { role: "user", content },
    parent_tool_use_id: null,
    parent_agent_id: null,
  }
}

export function assistantMessage(content: readonly unknown[]): unknown {
  return {
    type: "assistant",
    uuid: "a-1",
    session_id: "s-1",
    message: { role: "assistant", content },
    parent_tool_use_id: null,
    parent_agent_id: null,
  }
}
