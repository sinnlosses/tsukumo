// submodule を記録の版へ揃える入口（`.gitmodules` が無いとき・揃えられないとき・作業ツリーで進めたとき）を検証する。

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { alignSubmodules } from "../../../../scripts/dev/lib/submodule-drift.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

const SHA_A = "a".repeat(40)

describe("alignSubmodules", () => {
  test(".gitmodules が無ければ git を打たずに何もしない", () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "tsukumo-submodule-drift-"))
    expect(alignSubmodules(emptyRoot)).toEqual({ kind: "none" })
  })

  test("取り込めない url の gitlink は blocked にし、理由に git の失敗の文言を入れる", async () => {
    const root = mkdtempSync(join(tmpdir(), "tsukumo-submodule-drift-"))
    const git = async (...args: string[]): Promise<void> => {
      await runSubprocessOrThrow("git", ["-C", root, ...args])
    }
    await git("init", "-q")
    writeFileSync(
      join(root, ".gitmodules"),
      '[submodule "vendor/x"]\n\tpath = vendor/x\n\turl = ./nowhere\n',
    )
    await git("update-index", "--add", "--cacheinfo", `160000,${SHA_A},vendor/x`)

    const result = alignSubmodules(root)

    expect(result.kind).toBe("blocked")
    expect(result.kind === "blocked" ? result.reason : "").toContain("nowhere")
  })

  describe("記録の版と checkout の版が違うとき", () => {
    const GIT_IDENTITY = ["-c", "user.name=t", "-c", "user.email=t@example.com"]

    async function git(directory: string, ...args: string[]): Promise<string> {
      const output = await runSubprocessOrThrow("git", [
        "-C",
        directory,
        ...GIT_IDENTITY,
        "-c",
        "protocol.file.allow=always",
        ...args,
      ])
      return output.trim()
    }

    /** 親が `vendor/x` を1つ目の版で記録し、submodule の checkout は2つ目の版が使える状態にする。 */
    async function setUpRepositories(): Promise<{
      root: string
      checkout: string
      first: string
      second: string
    }> {
      const base = mkdtempSync(join(tmpdir(), "tsukumo-submodule-drift-"))
      const origin = join(base, "origin")
      const root = join(base, "root")
      mkdirSync(origin)
      mkdirSync(root)
      await git(origin, "init", "-q")
      await git(origin, "commit", "-q", "--allow-empty", "-m", "first")
      const first = await git(origin, "rev-parse", "HEAD")
      await git(origin, "commit", "-q", "--allow-empty", "-m", "second")
      const second = await git(origin, "rev-parse", "HEAD")
      await git(root, "init", "-q")
      await git(root, "submodule", "add", "-q", origin, "vendor/x")
      const checkout = join(root, "vendor/x")
      await git(checkout, "checkout", "-q", first)
      await git(root, "add", "vendor/x")
      return { root, checkout, first, second }
    }

    test("記録のほうが新しい checkout は記録の版へ揃える", async () => {
      const { root, checkout, first, second } = await setUpRepositories()
      await git(checkout, "checkout", "-q", second)
      await git(root, "add", "vendor/x")
      await git(checkout, "checkout", "-q", first)

      const result = alignSubmodules(root)

      expect(result.kind).toBe("aligned")
      expect(await git(checkout, "rev-parse", "HEAD")).toBe(second)
    })

    test("checkout を進めて git add していなければ戻さず blocked にする", async () => {
      const { root, checkout, first, second } = await setUpRepositories()
      await git(checkout, "checkout", "-q", second)

      const result = alignSubmodules(root)

      expect(result.kind).toBe("blocked")
      const reason = result.kind === "blocked" ? result.reason : ""
      expect(reason).toContain(first.slice(0, 7))
      expect(reason).toContain(second.slice(0, 7))
      expect(reason).toContain("git add vendor/x")
      expect(await git(checkout, "rev-parse", "HEAD")).toBe(second)
    })

    test("進めた checkout を git add 済みなら何もしない", async () => {
      const { root, checkout, second } = await setUpRepositories()
      await git(checkout, "checkout", "-q", second)
      await git(root, "add", "vendor/x")

      expect(alignSubmodules(root)).toEqual({ kind: "none" })
    })
  })
})
