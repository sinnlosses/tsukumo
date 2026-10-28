import { describe, expect, it } from "vitest"

import { callTool } from "../../../fixture/mcp-server.ts"
import { workServer } from "../../../fixture/sdk-tool.ts"

describe("report_part_card", () => {
  it("知っている部品の名前には、その部品の JSON Schema と例を返す（ターンは閉じない）", async () => {
    const reply = await callTool(workServer(), "report_part_card", { component: "Table" })

    expect(reply.isError).toBe(false)
    expect(reply.endsTurn).toBe(false)
    expect(reply.text).toContain("JSON Schema:\n{")
    expect(reply.text).toContain('"component":"Table"')
  })

  it("知らない名前には、引ける名前の一覧を isError 付きで返す", async () => {
    const reply = await callTool(workServer(), "report_part_card", { component: "table" })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("引ける名前: Report, Section, Paragraph")
  })
})
