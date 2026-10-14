import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createReportChanges } from "../../../../src/server/report/adapter/turn-change.ts"
import { runSubprocess } from "../../../fixture/subprocess.ts"

// 本物の `git` を使い、一時ディレクトリに作った架空のリポジトリだけを読む。

const git = async (cwd: string, ...args: readonly string[]): Promise<void> => {
  const result = await runSubprocess(
    "git",
    ["-c", "user.name=架空", "-c", "user.email=a@example.com", ...args],
    { cwd },
  )
  expect(result.exitCode).toBe(0)
}

async function makeRepository(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "tsukumo-turn-change-"))
  await git(dir, "init", "-q")
  writeFileSync(join(dir, "base.txt"), "架空")
  await git(dir, "add", "base.txt")
  await git(dir, "commit", "-q", "-m", "架空")
  return dir
}

describe("createReportChanges", () => {
  it("HEAD からのコミット済み・未コミット・未追跡の変更を、根からの相対パスで返す", async () => {
    const dir = await makeRepository()
    const changes = createReportChanges(dir)
    const head = await changes.readHead()
    expect(head).toMatch(/^[0-9a-f]{40}$/)

    mkdirSync(join(dir, "src/browser"), { recursive: true })
    writeFileSync(join(dir, "src/browser/committed.tsx"), "架空")
    await git(dir, "add", "src/browser/committed.tsx")
    await git(dir, "commit", "-q", "-m", "架空2")
    writeFileSync(join(dir, "base.txt"), "架空の変更")
    writeFileSync(join(dir, "src/browser/untracked.tsx"), "架空")

    const files = await changes.readChangedFiles(head ?? "")

    expect([...(files ?? [])].sort()).toEqual([
      "base.txt",
      "src/browser/committed.tsx",
      "src/browser/untracked.tsx",
    ])
  })

  it("変更が無ければ空", async () => {
    const changes = createReportChanges(await makeRepository())

    expect(await changes.readChangedFiles((await changes.readHead()) ?? "")).toEqual([])
  })

  it("git の外・無いディレクトリでは undefined（例外を投げない）", async () => {
    const outside = createReportChanges(mkdtempSync(join(tmpdir(), "tsukumo-turn-change-out-")))
    const missing = createReportChanges(join(tmpdir(), "tsukumo-turn-change-missing", "nowhere"))

    expect(await outside.readHead()).toBeUndefined()
    expect(await outside.readChangedFiles("0000")).toBeUndefined()
    expect(await missing.readHead()).toBeUndefined()
  })
})
