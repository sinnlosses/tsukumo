import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { listRecentCommits } from "../../../../src/server/repository/adapter/recent-commit.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

// ここは本物の `git` を一時のリポジトリで起こす（打つ引数と出力の割り方そのものが検査の対象）。

const IDENTITY = ["-c", "user.name=架空", "-c", "user.email=fictional@example.invalid"]

async function commitOn(repository: string, date: string, file: string): Promise<void> {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
  mkdirSync(join(repository, "dir"), { recursive: true })
  writeFileSync(join(repository, file), `${date}\n`)
  await runSubprocessOrThrow("git", ["add", file], { cwd: repository, env })
  await runSubprocessOrThrow("git", [...IDENTITY, "commit", "--quiet", "-m", "架空"], {
    cwd: repository,
    env,
  })
}

describe("listRecentCommits", () => {
  it("日と相対パスを新しい順で返す", async () => {
    const repository = mkdtempSync(join(tmpdir(), "tsukumo-recent-commit-"))
    await runSubprocessOrThrow("git", ["init", "--quiet"], { cwd: repository })
    await commitOn(repository, "2026-11-01T12:00:00+0000", "dir/one.txt")
    await commitOn(repository, "2026-11-02T12:00:00+0000", "dir/two.txt")

    expect(await listRecentCommits(repository, "2026-10-01")).toEqual({
      kind: "read",
      commits: [
        { date: "2026-11-02", paths: ["dir/two.txt"] },
        { date: "2026-11-01", paths: ["dir/one.txt"] },
      ],
    })
  })

  it("git のリポジトリでないディレクトリでは uncounted を返す", async () => {
    const plain = mkdtempSync(join(tmpdir(), "tsukumo-recent-commit-plain-"))

    expect(await listRecentCommits(plain, "2026-10-01")).toEqual({ kind: "uncounted" })
  })
})
