import { describe, expect, it } from "vitest"

import { callTool } from "../../../fixture/mcp-server.ts"
import { workServer } from "../../../fixture/sdk-tool.ts"

describe("report_part_card", () => {
  it("知っている種類には、その部品の型と例を返す（ターンは閉じない）", async () => {
    const reply = await callTool(workServer(), "report_part_card", { kind: "graph" })

    expect(reply.isError).toBe(false)
    expect(reply.endsTurn).toBe(false)
    expect(reply.text).toContain("type GraphBlock = ")
    expect(reply.text).toContain('例:\n{"kind":"graph"')
  })

  it("知らない種類には、引ける種類の一覧を isError 付きで返す", async () => {
    const reply = await callTool(workServer(), "report_part_card", { kind: "files" })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("引ける種類: text, list, table")
  })
})
