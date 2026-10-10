import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  readWorkflowPlugin,
  readWorkflowPluginMount,
} from "../../../../src/server/session-driver/adapter/workflow-plugin.ts"

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

describe("readWorkflowPluginMount", () => {
  let bundled: string
  let config: string

  beforeEach(async () => {
    bundled = await mkdtemp(join(tmpdir(), "tsukumo-workflow-bundled-"))
    config = await mkdtemp(join(tmpdir(), "tsukumo-workflow-config-"))
    await mkdir(join(bundled, "skills", "next-task"), { recursive: true })
    await mkdir(join(bundled, "skills", "plan-tasks"), { recursive: true })
    await mkdir(join(bundled, "agents"), { recursive: true })
    await writeFile(join(bundled, "agents", "reviewer.md"), "")
  })

  afterEach(async () => {
    await rm(bundled, { recursive: true, force: true })
    await rm(config, { recursive: true, force: true })
  })

  async function install(skills: string[], agents: string[]): Promise<void> {
    await mkdir(join(config, "skills"), { recursive: true })
    await mkdir(join(config, "agents"), { recursive: true })
    for (const name of skills) {
      await mkdir(join(config, "skills", name))
    }
    for (const name of agents) {
      await writeFile(join(config, "agents", `${name}.md`), "")
    }
  }

  it("スキルもエージェントも全部あれば、載せない", async () => {
    await install(["next-task", "plan-tasks", "other"], ["reviewer"])

    expect(await readWorkflowPluginMount(bundled, config)).toEqual({ kind: "user-installed" })
  })

  it("スキルが揃ってもエージェントが欠ければ、載せる側で欠けを返す", async () => {
    await install(["next-task", "plan-tasks"], [])

    expect(await readWorkflowPluginMount(bundled, config)).toEqual({
      kind: "partial",
      missing: ["agents/reviewer"],
    })
  })

  it("スキルが一部だけなら、載せる側で欠けを返す", async () => {
    await install(["next-task"], ["reviewer"])

    expect(await readWorkflowPluginMount(bundled, config)).toEqual({
      kind: "partial",
      missing: ["skills/plan-tasks"],
    })
  })

  it("利用者の置き場が空なら、黙って載せる", async () => {
    expect(await readWorkflowPluginMount(bundled, config)).toEqual({ kind: "mount" })
  })

  it("取り込んだ側が空なら、揃っているとは読まず載せる", async () => {
    const empty = await mkdtemp(join(tmpdir(), "tsukumo-workflow-empty-"))
    await install(["next-task"], ["reviewer"])

    expect(await readWorkflowPluginMount(empty, config)).toEqual({ kind: "mount" })
    await rm(empty, { recursive: true, force: true })
  })
})
