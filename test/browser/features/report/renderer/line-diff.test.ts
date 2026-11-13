import { describe, expect, it } from "vitest"

import { unifiedDiffSource } from "../../../../../src/browser/features/report/renderer/line-diff.ts"

function lines(count: number, label: string): string {
  return Array.from({ length: count }, (_, index) => `${label}${index}`).join("\n")
}

describe("unifiedDiffSource", () => {
  it("値を変えた行は前の行（-）と後の行（+）の対、間に入れた行は + だけになる", () => {
    const before = "retry:\n  max: 3\n  backoff: 200ms\ntimeout: 5s"
    const after = "retry:\n  max: 5\n  backoff: 200ms\n  jitter: true\ntimeout: 5s"

    expect(unifiedDiffSource(before, after)).toBe(
      [
        " retry:",
        "-  max: 3",
        "+  max: 5",
        "   backoff: 200ms",
        "+  jitter: true",
        " timeout: 5s",
      ].join("\n"),
    )
  })

  it("全部同じなら、印の付く行は無い", () => {
    expect(unifiedDiffSource("a\nb\n", "a\nb")).toBe(" a\n b")
  })

  it("変えた行が続くときは、前の行をまとめて先に、後の行をあとに並べる", () => {
    expect(unifiedDiffSource("a\nb", "x\ny")).toBe("-a\n-b\n+x\n+y")
  })

  it("全部違って行数が違えば、余りは消した行か足した行になる", () => {
    expect(unifiedDiffSource("a\nb\nc", "x")).toBe("-a\n-b\n-c\n+x")
    expect(unifiedDiffSource("a", "x\ny")).toBe("-a\n+x\n+y")
  })

  it("消しただけなら - の行だけが出る", () => {
    expect(unifiedDiffSource("a\nb\nc", "a\nc")).toBe(" a\n-b\n c")
  })

  it("どちらかの側が 201 行なら比べず、200 行ちょうどなら比べる", () => {
    expect(unifiedDiffSource(lines(201, "a"), "a0")).toBeUndefined()
    expect(unifiedDiffSource("a0", lines(201, "a"))).toBeUndefined()
    expect(unifiedDiffSource(lines(200, "a"), lines(200, "a"))?.split("\n")).toHaveLength(200)
  })
})
