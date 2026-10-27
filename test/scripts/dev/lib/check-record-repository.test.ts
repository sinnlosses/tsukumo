// `pnpm run check` の控えの鍵にする木の SHA の取り方と、控えの読み書きを一時リポジトリで検証する。

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  readCheckRecord,
  worktreeTree,
  writeCheckRecord,
} from "../../../../scripts/dev/lib/check-record-repository.ts"
import { EMPTY_CHECK_RECORD } from "../../../../scripts/dev/lib/check-record.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

// 一時リポジトリで git を何回も走らせるので、`pnpm run check` の並列の負荷で既定の 5000ms を
// 超えることがある。
const GIT_LOAD_TIMEOUT_MS = 20_000

async function withRepository(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "check-record-"))
  try {
    for (const args of [
      ["init", "--quiet"],
      ["config", "user.email", "test@example.com"],
      ["config", "user.name", "test"],
    ]) {
      await runSubprocessOrThrow("git", args, { cwd: root })
    }
    writeFileSync(join(root, "a.ts"), "a\n")
    writeFileSync(join(root, ".gitignore"), "ignored.txt\n")
    await runSubprocessOrThrow("git", ["add", "."], { cwd: root })
    await runSubprocessOrThrow("git", ["commit", "--quiet", "-m", "base"], { cwd: root })
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("worktreeTree", { timeout: GIT_LOAD_TIMEOUT_MS }, () => {
  test("未コミット・未追跡の変更で木が変わり、.gitignore の対象では変わらず、本物の index は変えない", async () => {
    await withRepository(async (root) => {
      const index = join(root, ".git", "index")
      const indexBefore = readFileSync(index)
      const base = worktreeTree(root)
      expect(base).toMatch(/^[0-9a-f]{40}$/)

      writeFileSync(join(root, "ignored.txt"), "x\n")
      expect(worktreeTree(root)).toBe(base)

      writeFileSync(join(root, "untracked.ts"), "u\n")
      const withUntracked = worktreeTree(root)
      expect(withUntracked).not.toBe(base)

      writeFileSync(join(root, "a.ts"), "changed\n")
      expect(worktreeTree(root)).not.toBe(withUntracked)
      expect(readFileSync(index)).toEqual(indexBefore)
    })
  })

  test("git のリポジトリでなければ空", () => {
    const root = mkdtempSync(join(tmpdir(), "check-record-plain-"))
    try {
      expect(worktreeTree(root)).toBe("")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("readCheckRecord と writeCheckRecord", () => {
  test("書いた控えを読み戻し、無い・壊れた・形の違う控えは空の控えに畳む", () => {
    const root = mkdtempSync(join(tmpdir(), "check-record-file-"))
    try {
      expect(readCheckRecord(root)).toEqual(EMPTY_CHECK_RECORD)
      const record = {
        tree: "abc",
        stages: [{ name: "lint", args: [], result: "passed", retryFiles: [], failedTests: [] }],
      } as const
      writeCheckRecord(root, record)
      expect(readCheckRecord(root)).toEqual(record)

      writeFileSync(join(root, ".check-record.json"), "{")
      expect(readCheckRecord(root)).toEqual(EMPTY_CHECK_RECORD)
      writeFileSync(
        join(root, ".check-record.json"),
        JSON.stringify({ tree: "abc", stages: [{ name: "lint", args: [], result: "unknown" }] }),
      )
      expect(readCheckRecord(root)).toEqual(EMPTY_CHECK_RECORD)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
