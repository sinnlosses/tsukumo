// `report` の検査で、ブロックのファイル読みと mermaid の構文検査が並んで走ることを確かめる。

import { afterEach, describe, expect, it, vi } from "vitest"

import { callTool } from "../../../fixture/mcp-server.ts"
import { CLOSING, FIGURE, REMAINING, SUMMARY, WAITING_LINE } from "../../../fixture/sdk-tool.ts"

describe("report の検査の並び", () => {
  afterEach(() => {
    vi.doUnmock("../../../../src/server/report/adapter/report-file.ts")
    vi.doUnmock("../../../../src/server/report/adapter/report-mermaid-syntax.ts")
    vi.resetModules()
  })

  it("ファイル読みが終わる前に mermaid の検査を始める", async () => {
    const started: string[] = []
    const fileRead = Promise.withResolvers<ReadonlyMap<string, string>>()
    vi.resetModules()
    vi.doMock("../../../../src/server/report/adapter/report-file.ts", () => ({
      readReportBlockFiles: () => {
        started.push("file")
        return fileRead.promise
      },
    }))
    vi.doMock("../../../../src/server/report/adapter/report-mermaid-syntax.ts", () => ({
      checkMermaidSyntax: () => {
        started.push("mermaid")
        return Promise.resolve([])
      },
    }))
    const { workServer: server } = await import("../../../fixture/sdk-tool.ts")

    const call = callTool(server(), "report", {
      conclusion: ["架空の結論"],
      sections: [{ blocks: [{ kind: "mermaid", source: "sequenceDiagram\n  A->>B: hi" }] }],
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })
    await vi.waitFor(() => expect(started).toEqual(["file", "mermaid"]))
    fileRead.resolve(new Map())
    await call
  })
})
