import { describe, expect, it } from "vitest"

import {
  diffLines,
  sideLines,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/line-diff.ts"

function lines(count: number, label: string): string {
  return Array.from({ length: count }, (_, index) => `${label}${index}`).join("\n")
}

describe("diffLines", () => {
  const before = "retry:\n  max: 3\n  backoff: 200ms\ntimeout: 5s"
  const after = "retry:\n  max: 5\n  backoff: 200ms\n  jitter: true\ntimeout: 5s"

  it("値を変えた行は変えた行の対、間に入れた行は足した行になる", () => {
    expect(diffLines(before, after)).toEqual([
      { change: "same", before: 0, after: 0 },
      { change: "changed", before: 1, after: 1 },
      { change: "same", before: 2, after: 2 },
      { change: "added", after: 3 },
      { change: "same", before: 3, after: 4 },
    ])
  })

  it("前の側から見ると、足した行の向かいは空の行になる", () => {
    const aligned = diffLines(before, after) ?? []
    expect(sideLines(aligned, "before")).toEqual([
      { kind: "line", index: 0, change: "same" },
      { kind: "line", index: 1, change: "changed" },
      { kind: "line", index: 2, change: "same" },
      { kind: "gap" },
      { kind: "line", index: 3, change: "same" },
    ])
    expect(sideLines(aligned, "after").map((line) => line.kind)).toEqual([
      "line",
      "line",
      "line",
      "line",
      "line",
    ])
  })

  it("全部同じなら印の付く行は無い", () => {
    expect(diffLines("a\nb\n", "a\nb")).toEqual([
      { change: "same", before: 0, after: 0 },
      { change: "same", before: 1, after: 1 },
    ])
  })

  it("全部違って行数が同じなら、全部が変えた行の対になる", () => {
    expect(diffLines("a\nb", "x\ny")).toEqual([
      { change: "changed", before: 0, after: 0 },
      { change: "changed", before: 1, after: 1 },
    ])
  })

  it("全部違って行数が違えば、余りが消した行か足した行になる", () => {
    expect(diffLines("a\nb\nc", "x")).toEqual([
      { change: "changed", before: 0, after: 0 },
      { change: "removed", before: 1 },
      { change: "removed", before: 2 },
    ])
    expect(diffLines("a", "x\ny")).toEqual([
      { change: "changed", before: 0, after: 0 },
      { change: "added", after: 1 },
    ])
  })

  it("消しただけなら消した行だけが出る", () => {
    expect(diffLines("a\nb\nc", "a\nc")).toEqual([
      { change: "same", before: 0, after: 0 },
      { change: "removed", before: 1 },
      { change: "same", before: 2, after: 1 },
    ])
  })

  it("どちらかの側が 201 行なら比べず、200 行ちょうどなら比べる", () => {
    expect(diffLines(lines(201, "a"), "a0")).toBeUndefined()
    expect(diffLines("a0", lines(201, "a"))).toBeUndefined()
    expect(diffLines(lines(200, "a"), lines(200, "a"))).toHaveLength(200)
  })
})
