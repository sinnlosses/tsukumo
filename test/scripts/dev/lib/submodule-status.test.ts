import { describe, expect, test } from "vitest"

import { classifySubmoduleStatus } from "../../../../scripts/dev/lib/submodule-status.ts"

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
