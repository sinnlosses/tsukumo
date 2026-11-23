import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readMapView } from "../../../../src/server/architecture-map/adapter/architecture-map-view.ts"
import { RPC_PATH, type RpcClient } from "../../../../src/shared/rpc.ts"
import {
  closeRunningView,
  noCharacterAsset,
  noPromptImage,
  startView,
  TOKEN,
  viewOrigin,
} from "../../../fixture/view-server.ts"
import { sampleMap } from "../sample-map.ts"

const MAP_FILE_NAME = ".architecture-map.json"

let cwd = ""

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "architecture-map-procedure-"))
})

afterEach(async () => {
  await closeRunningView()
  await rm(cwd, { recursive: true, force: true })
})

/** 本物の読み口（作業ディレクトリは `cwd`）を載せて起こし、ブラウザと同じ型付きの client を返す。 */
async function clientOverRealPort(): Promise<RpcClient> {
  const server = await startView(noCharacterAsset, noPromptImage, {
    readArchitectureMapView: (selection) => readMapView(cwd, selection),
  })
  const url = new URL(`${viewOrigin(server)}${RPC_PATH}`)
  url.searchParams.set("t", TOKEN)
  return createORPCClient(new RPCLink({ url: url.toString() }))
}

describe("architectureMap.view", () => {
  it("地図のファイルが無いリポジトリでは absent を返す", async () => {
    const client = await clientOverRealPort()

    expect(await client.architectureMap.view({ kind: "level", level: 1 })).toEqual({
      kind: "absent",
    })
  })

  it("壊れている・知らない版のファイルでは、理由つきの unreadable を返す", async () => {
    const client = await clientOverRealPort()

    await writeFile(join(cwd, MAP_FILE_NAME), "{ broken")
    expect(await client.architectureMap.view({ kind: "level", level: 1 })).toEqual({
      kind: "unreadable",
      reason: "not-json",
    })

    await writeFile(join(cwd, MAP_FILE_NAME), JSON.stringify({ ...sampleMap(), version: 2 }))
    expect(await client.architectureMap.view({ kind: "level", level: 1 })).toEqual({
      kind: "unreadable",
      reason: "newer-version",
    })
  })

  it("縮尺を指して全体の図を、箱を指してその子の図を引ける", async () => {
    await writeFile(join(cwd, MAP_FILE_NAME), JSON.stringify(sampleMap()))
    const client = await clientOverRealPort()

    const whole = await client.architectureMap.view({ kind: "level", level: 1 })
    const focused = await client.architectureMap.view({ kind: "focus", box: "frontend" })

    expect(whole.kind === "ready" ? whole.view.boxes.map((box) => box.id) : []).toEqual([
      "app",
      "server",
      "vault",
    ])
    expect(focused.kind === "ready" ? focused.view.focus?.id : "").toBe("app")
  })

  it("指した箱が無い・子を持たないときは unfocusable を返す", async () => {
    await writeFile(join(cwd, MAP_FILE_NAME), JSON.stringify(sampleMap()))
    const client = await clientOverRealPort()

    expect(await client.architectureMap.view({ kind: "focus", box: "nowhere" })).toEqual({
      kind: "unfocusable",
      reason: "unknown-box",
    })
    expect(await client.architectureMap.view({ kind: "focus", box: "vault" })).toEqual({
      kind: "unfocusable",
      reason: "no-children",
    })
  })

  it("縮尺が 1・2・3 の外なら、口へ渡す前に契約が断る", async () => {
    const server = await startView(noCharacterAsset, noPromptImage)

    const response = await fetch(
      `${viewOrigin(server)}${RPC_PATH}/architectureMap/view?t=${TOKEN}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { kind: "level", level: 4 } }),
      },
    )

    expect(response.status).toBe(400)
  })
})
