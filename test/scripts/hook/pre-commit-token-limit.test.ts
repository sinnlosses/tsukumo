// pre-commit の契約（コミットは止めず、上限を超えたら stderr で警告する・git が失敗したら黙って通す）を、入口を実際に起こして確かめる。
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

/** 終了コードは常に 0 なので、警告を出したかだけを返す。 */
async function warns(cwd: string = repo): Promise<string> {
  const result = await runSubprocess("node", [ENTRY], { cwd })
  expect(result.exitCode).toBe(0)
  return result.stderr
}

describe("新規のファイル", () => {
  test("24,001 バイトは止めずに、理由と積み先を stderr に出す", async () => {
    put("big.txt", 24001)
    await stage()

    const stderr = await warns()

    expect(stderr).toContain("big.txt")
    expect(stderr).toContain("上限 6000")
    expect(stderr).toContain("コミットは止めません")
  })

  test("24,000 バイトちょうどは警告しない", async () => {
    put("edge.txt", 24000)
    await stage()

    expect(await warns()).toBe("")
  })
})

describe("HEAD にある超過ファイル", () => {
  beforeEach(async () => {
    put("large.txt", 25000)
    await commit()
  })

  test("縮めるのは警告しない", async () => {
    put("large.txt", 24500)
    await stage()

    expect(await warns()).toBe("")
  })

  test("増やすと警告する", async () => {
    put("large.txt", 26000)
    await stage()

    expect(await warns()).toContain("+1000")
  })

  test("名前変更で増やすと警告し、縮めるなら警告しない", async () => {
    await git(["mv", "large.txt", "moved.txt"])
    put("moved.txt", 26000)
    await stage()
    expect(await warns()).toContain("moved.txt")

    put("moved.txt", 24500)
    await stage()
    expect(await warns()).toBe("")
  })
})

describe("検査から外すもの", () => {
  test("ロックファイルとバイナリは大きくても警告しない", async () => {
    put("pnpm-lock.yaml", 30000)
    put("image.bin", Buffer.alloc(30000, 0))
    await stage()

    expect(await warns()).toBe("")
  })
})

describe("git が失敗するとき", () => {
  test("git 管理外のディレクトリでは黙って通す", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tsukumo-token-limit-outside-"))
    try {
      expect(await warns(outside)).toBe("")
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
