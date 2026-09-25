import { describe, expect, it } from "bun:test"

import {
  childProcessEnv,
  isVisibleOutputNudge,
  TERMINAL_MCP_TOOLS_ENV_NAME,
} from "../../../../src/server/session-driver/core/visible-output-nudge.ts"

// 催促の文面は本体の固定文をそのまま使う（利用者の発言ではなく本体が差し込むもの。
// docs/coding-standards.md「会話内容の扱い」の対象ではない）。
const NUDGE =
  "[Your previous response had no visible output. Please continue and produce a user-visible response.]"

describe("childProcessEnv", () => {
  it("引き継いだ環境に CLAUDE_CODE_TERMINAL_MCP_TOOLS=mcp__tsukumo__speak を足す", () => {
    expect(childProcessEnv({ PATH: "/usr/bin" })).toEqual({
      PATH: "/usr/bin",
      CLAUDE_CODE_TERMINAL_MCP_TOOLS: "mcp__tsukumo__speak",
    })
    expect(TERMINAL_MCP_TOOLS_ENV_NAME).toBe("CLAUDE_CODE_TERMINAL_MCP_TOOLS")
  })

  it("引き継いだ環境を書き換えない", () => {
    const inherited = { PATH: "/usr/bin" }
    childProcessEnv(inherited)

    expect(inherited).toEqual({ PATH: "/usr/bin" })
  })
})

describe("isVisibleOutputNudge", () => {
  it("催促の文面で始まる user メッセージ（content が文字列）を見分ける", () => {
    expect(isVisibleOutputNudge({ type: "user", message: { role: "user", content: NUDGE } })).toBe(
      true,
    )
  })

  it("text ブロック1つに入った催促も見分ける", () => {
    expect(
      isVisibleOutputNudge({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: NUDGE }] },
      }),
    ).toBe(true)
  })

  it("利用者の依頼・tool_result・assistant は催促ではない", () => {
    expect(
      isVisibleOutputNudge({ type: "user", message: { role: "user", content: "ダミーの依頼" } }),
    ).toBe(false)
    expect(
      isVisibleOutputNudge({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: NUDGE }],
        },
      }),
    ).toBe(false)
    expect(
      isVisibleOutputNudge({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: NUDGE }] },
      }),
    ).toBe(false)
    expect(isVisibleOutputNudge("文字列")).toBe(false)
  })
})
