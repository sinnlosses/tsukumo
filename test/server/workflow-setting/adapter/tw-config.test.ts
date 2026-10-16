import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { twConfigPort } from "../../../../src/server/workflow-setting/adapter/tw-config.ts"

describe("twConfigPort", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tsukumo-tw-config-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("tw が無ければ missing", async () => {
    const outcome = await twConfigPort(join(dir, "無い-tw"), dir).config()

    expect(outcome).toEqual({ kind: "missing" })
  })

  it("schema は config --schema だけを打つ", async () => {
    const script = join(dir, "tw")
    await writeFile(script, ["#!/bin/sh", 'printf "%s|" "$@"', ""].join("\n"))
    await chmod(script, 0o755)

    expect(await twConfigPort(script, dir).schema()).toMatchObject({
      stdout: "config|--schema|",
    })
  })

  it("引数をそのまま渡し、終了コード・stdout・stderr を受け取る", async () => {
    const script = join(dir, "tw")
    await writeFile(
      script,
      ["#!/bin/sh", 'printf "%s|" "$@"', 'echo "架空の理由" >&2', "exit 2", ""].join("\n"),
    )
    await chmod(script, 0o755)

    const outcome = await twConfigPort(script, dir).set("parts.reviewer", "架空 の役")

    expect(outcome).toEqual({
      kind: "ran",
      exitCode: 2,
      stdout: "config|set|parts.reviewer|架空 の役|",
      stderr: "架空の理由\n",
    })
  })
})
