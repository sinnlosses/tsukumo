// 作業ツリーの根が、環境変数、無ければ入力の cwd から、絶対パスのときだけ決まることを確かめる。

import { afterEach, describe, expect, test, vi } from "vitest"

import { readWorkRoot } from "../../../../scripts/hook/lib/worktree-shell-write.ts"
import { bashCall } from "../../../fixture/bash-hook-call.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("readWorkRoot", () => {
  test("環境変数が絶対パスならその値", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", "/work/a")
    expect(readWorkRoot(bashCall("ls", { cwd: "/work/b" }))).toBe("/work/a")
  })

  test("環境変数が空なら入力の cwd", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", "")
    expect(readWorkRoot(bashCall("ls", { cwd: "/work/b" }))).toBe("/work/b")
  })

  test("環境変数が相対パスなら cwd へ回らず決まらない", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", "relative/dir")
    expect(readWorkRoot(bashCall("ls", { cwd: "/work/b" }))).toBeUndefined()
  })

  test("環境変数が空で cwd が無い、または相対パスなら決まらない", () => {
    vi.stubEnv("CLAUDE_PROJECT_DIR", "")
    expect(readWorkRoot(bashCall("ls"))).toBeUndefined()
    expect(readWorkRoot(bashCall("ls", { cwd: "b" }))).toBeUndefined()
  })
})
