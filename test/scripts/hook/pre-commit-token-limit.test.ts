// pre-commit の契約（終了コードで伝える・git が失敗したら通す）を、入口を実際に起こして確かめる。
// 実際の作業ツリーや共有の .git/hooks は触らず、一時ディレクトリの git で行う。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const ENTRY = fileURLToPath(
  new URL("../../../scripts/hook/pre-commit-token-limit.ts", import.meta.url),
)

let repo = ""

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "tsukumo-token-limit-"))
  await git(["init", "-q"])
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

async function git(args: readonly string[]): Promise<void> {
  const result = await runSubprocess(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args],
    { cwd: repo },
  )
  expect(result.exitCode, result.stderr).toBe(0)
}

function put(path: string, bytes: number | Buffer): void {
  const full = join(repo, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, typeof bytes === "number" ? "a".repeat(bytes) : bytes)
}

async function stage(): Promise<void> {
  await git(["add", "."])
}

async function commit(): Promise<void> {
  await stage()
  await git(["commit", "-q", "-m", "base", "--no-verify"])
}

function runEntry(cwd: string = repo) {
  return runSubprocess("node", [ENTRY], { cwd })
}

describe("新規のファイル", () => {
  test("20,001 バイトは終了コード 1 で止め、理由を stderr に出す", async () => {
    put("big.txt", 20001)
    await stage()

    const result = await runEntry()

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("big.txt")
    expect(result.stderr).toContain("5000")
    expect(result.stderr).toContain("--no-verify")
  })

  test("20,000 バイトちょうどは通す", async () => {
    put("edge.txt", 20000)
    await stage()

    expect((await runEntry()).exitCode).toBe(0)
  })
})

describe("HEAD にある超過ファイル", () => {
  beforeEach(async () => {
    put("large.txt", 25000)
    await commit()
  })

  test("縮めるのは通す", async () => {
    put("large.txt", 24000)
    await stage()

    expect((await runEntry()).exitCode).toBe(0)
  })

  test("増やすと止める", async () => {
    put("large.txt", 26000)
    await stage()

    const result = await runEntry()

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("+1000")
  })

  test("名前変更で増やすと止め、縮めるなら通す", async () => {
    await git(["mv", "large.txt", "moved.txt"])
    put("moved.txt", 26000)
    await stage()
    expect((await runEntry()).exitCode).toBe(1)

    put("moved.txt", 24000)
    await stage()
    expect((await runEntry()).exitCode).toBe(0)
  })
})

describe("検査から外すもの", () => {
  test("ロックファイルとバイナリは大きくても通す", async () => {
    put("pnpm-lock.yaml", 30000)
    put("image.bin", Buffer.alloc(30000, 0))
    await stage()

    expect((await runEntry()).exitCode).toBe(0)
  })
})

describe("git が失敗するとき", () => {
  test("git 管理外のディレクトリでは通す", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tsukumo-token-limit-outside-"))
    try {
      expect((await runEntry(outside)).exitCode).toBe(0)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
