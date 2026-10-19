import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runWorkflowTw } from "../../../../src/server/session-driver/adapter/sdk-workflow-tw.ts"

describe("runWorkflowTw", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tsukumo-workflow-tw-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function twScript(body: string): Promise<string> {
    const path = join(dir, "tw")
    await writeFile(path, `#!/bin/sh\n${body}\n`)
    await chmod(path, 0o755)
    return path
  }

  it("標準入力はそのまま子に届き、サブコマンドは第1引数に渡り、標準出力が返る", async () => {
    const twPath = await twScript('printf "%s:" "$1"; cat')

    expect(
      await runWorkflowTw({ twPath, subcommand: "lap-hook", stdin: '{"a":1}', timeoutMs: 5000 }),
    ).toBe('lap-hook:{"a":1}')
  })

  it("0 以外で終わると空文字列", async () => {
    const twPath = await twScript("echo out; exit 3")

    expect(await runWorkflowTw({ twPath, subcommand: "x", stdin: "", timeoutMs: 5000 })).toBe("")
  })

  it("タイムアウトすると空文字列", async () => {
    const twPath = await twScript("sleep 5; echo late")

    expect(await runWorkflowTw({ twPath, subcommand: "x", stdin: "", timeoutMs: 200 })).toBe("")
  })

  it("実行ファイルが無いと空文字列", async () => {
    expect(
      await runWorkflowTw({
        twPath: join(dir, "missing"),
        subcommand: "x",
        stdin: "{}",
        timeoutMs: 5000,
      }),
    ).toBe("")
  })
})
