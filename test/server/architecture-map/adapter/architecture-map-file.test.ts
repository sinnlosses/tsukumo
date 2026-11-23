import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readArchitectureMapFile } from "../../../../src/server/architecture-map/adapter/architecture-map-file.ts"
import { MAX_ARCHITECTURE_MAP_BYTES } from "../../../../src/shared/architecture-map/architecture-map.ts"
import { sampleMap } from "../sample-map.ts"

const ARCHITECTURE_MAP_FILE_NAME = ".architecture-map.json"

let cwd = ""

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "architecture-map-"))
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe("readArchitectureMapFile", () => {
  it("ファイルが無ければ absent", async () => {
    expect(await readArchitectureMapFile(cwd)).toEqual({ kind: "absent" })
  })

  it("正しいファイルは地図として読む", async () => {
    await writeFile(join(cwd, ARCHITECTURE_MAP_FILE_NAME), JSON.stringify(sampleMap()))

    expect((await readArchitectureMapFile(cwd)).kind).toBe("map")
  })

  it("壊れたファイルは理由つきの unreadable", async () => {
    await writeFile(join(cwd, ARCHITECTURE_MAP_FILE_NAME), "{ broken")

    expect(await readArchitectureMapFile(cwd)).toEqual({ kind: "unreadable", reason: "not-json" })
  })

  it("5 MiB を超えるファイルは読まずに too-large", async () => {
    await writeFile(
      join(cwd, ARCHITECTURE_MAP_FILE_NAME),
      " ".repeat(MAX_ARCHITECTURE_MAP_BYTES + 1),
    )

    expect(await readArchitectureMapFile(cwd)).toEqual({ kind: "unreadable", reason: "too-large" })
  })
})
