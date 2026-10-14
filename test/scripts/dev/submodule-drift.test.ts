// `git submodule status` の行頭の印の振り分けと、`.gitmodules` が無いときの入口の振る舞いを検証する。

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  alignSubmodules,
  classifySubmoduleStatus,
} from "../../../scripts/dev/lib/submodule-drift.ts"
import { runSubprocessOrThrow } from "../../fixture/subprocess.ts"

const SHA_A = "a".repeat(40)
const SHA_B = "b".repeat(40)

describe("classifySubmoduleStatus", () => {
  test("行頭が空白なら揃っているものにする", () => {
    expect(classifySubmoduleStatus(` ${SHA_A} vendor/x (heads/main)\n`)).toEqual({
      drifted: [],
      conflicted: [],
      aligned: [{ path: "vendor/x", sha: SHA_A }],
    })
  })

  test("行頭 + は記録と違う版として揃える対象にする", () => {
    expect(classifySubmoduleStatus(`+${SHA_A} vendor/x (heads/main)\n`).drifted).toEqual([
      { path: "vendor/x", sha: SHA_A },
    ])
  })

  test("行頭 - は未取り込みとして揃える対象にする", () => {
    expect(classifySubmoduleStatus(`-${SHA_A} vendor/x\n`).drifted).toEqual([
      { path: "vendor/x", sha: SHA_A },
    ])
  })

  test("行頭 U は衝突として止める対象にする", () => {
    const result = classifySubmoduleStatus(`U${SHA_A} vendor/x\n`)
    expect(result.conflicted).toEqual([{ path: "vendor/x", sha: SHA_A }])
    expect(result.drifted).toEqual([])
  })

  test("複数行を行ごとに振り分け、空行は読み飛ばす", () => {
    const result = classifySubmoduleStatus(
      ` ${SHA_A} vendor/a\n+${SHA_B} vendor/b (x)\n\n-${SHA_A} vendor/c\n`,
    )
    expect(result.aligned.map((entry) => entry.path)).toEqual(["vendor/a"])
    expect(result.drifted.map((entry) => entry.path)).toEqual(["vendor/b", "vendor/c"])
  })

  test("出力が空なら全部空", () => {
    expect(classifySubmoduleStatus("")).toEqual({ drifted: [], conflicted: [], aligned: [] })
  })
})

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
})
