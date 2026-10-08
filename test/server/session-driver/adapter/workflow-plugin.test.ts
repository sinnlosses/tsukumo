import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readWorkflowPlugin } from "../../../../src/server/session-driver/adapter/workflow-plugin.ts"

describe("readWorkflowPlugin", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tsukumo-workflow-plugin-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("plugin.json があれば読める", async () => {
    await mkdir(join(dir, ".claude-plugin"))
    await writeFile(join(dir, ".claude-plugin", "plugin.json"), "{}")

    expect(await readWorkflowPlugin(dir)).toEqual({ ok: true })
  })

  it("空の置き場は、直し方を添えて読めないと返す", async () => {
    const reading = await readWorkflowPlugin(dir)

    expect(reading.ok).toBe(false)
    expect(!reading.ok && reading.reason).toContain("git submodule update --init")
  })
})
