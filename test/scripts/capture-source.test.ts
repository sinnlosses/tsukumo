import { describe, expect, test } from "vitest"

import { sourceOf } from "../../scripts/lib/capture-source.ts"

const DEFAULT_CWD = "/work/tree"

describe("sourceOf", () => {
  test("URL だけなら URL を開く", () => {
    expect(sourceOf("http://x", undefined, undefined, undefined, DEFAULT_CWD)).toEqual({
      kind: "url",
      url: "http://x",
    })
  })

  test("場面の起動先は --cwd が無ければ既定に畳まれる", () => {
    expect(sourceOf(undefined, "report", 3, undefined, DEFAULT_CWD)).toEqual({
      kind: "scene",
      scene: "report",
      until: 3,
      cwd: DEFAULT_CWD,
    })
  })

  test("--cwd は場面の起動先になる", () => {
    expect(sourceOf(undefined, "report", undefined, "/scratch/a", DEFAULT_CWD)).toEqual({
      kind: "scene",
      scene: "report",
      until: undefined,
      cwd: "/scratch/a",
    })
  })

  test("URL と --cwd・場面と URL・場面の無い --until-step / --cwd は読まない", () => {
    expect(sourceOf("http://x", undefined, undefined, "/a", DEFAULT_CWD)).toBeUndefined()
    expect(sourceOf("http://x", "report", undefined, undefined, DEFAULT_CWD)).toBeUndefined()
    expect(sourceOf(undefined, undefined, 2, undefined, DEFAULT_CWD)).toBeUndefined()
    expect(sourceOf(undefined, undefined, undefined, "/a", DEFAULT_CWD)).toBeUndefined()
    expect(sourceOf(undefined, undefined, undefined, undefined, DEFAULT_CWD)).toBeUndefined()
  })
})
