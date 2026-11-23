import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { tsukumoServer } from "../../../../../src/server/session-driver/adapter/sdk/sdk-tool.ts"
import { createCallReview } from "../../../../../src/server/session-driver/core/call-review.ts"
import { callTool } from "../../../../fixture/mcp-server.ts"
import { TOOL_EXPRESSIONS, WORK_MODE } from "../../../../fixture/sdk-tool.ts"
import { sampleMap } from "../../../architecture-map/sample-map.ts"

let cwd = ""

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "sdk-map-box-tool-"))
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

function serverAt(dir: string) {
  return tsukumoServer(
    TOOL_EXPRESSIONS,
    WORK_MODE,
    createCallReview(),
    () => {},
    dir,
    () => {},
    () => {},
    () => true,
  )
}

describe("map_box", () => {
  it("地図のファイルが無いときは理由つきで断る", async () => {
    const reply = await callTool(serverAt(cwd), "map_box", {})

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("地図のファイルがありません")
  })

  it("読めないときは理由の種類つきで断る", async () => {
    await writeFile(join(cwd, ".architecture-map.json"), "{壊れている")

    const reply = await callTool(serverAt(cwd), "map_box", {})

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("地図のファイルを読めません（理由: ")
  })

  it("ID で箱の定義を返し、知らない ID は断る", async () => {
    await writeFile(join(cwd, ".architecture-map.json"), JSON.stringify(sampleMap()))

    const found = await callTool(serverAt(cwd), "map_box", { id: "server" })
    const unknown = await callTool(serverAt(cwd), "map_box", { id: "nothing" })

    expect(found.isError).toBe(false)
    expect(JSON.parse(found.text)).toMatchObject({ kind: "box", id: "server" })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain("その ID の箱は地図にありません")
  })
})
