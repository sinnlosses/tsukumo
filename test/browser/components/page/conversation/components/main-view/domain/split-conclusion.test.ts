import { describe, expect, it } from "vitest"

import { splitConclusion } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/split-conclusion.ts"

describe("splitConclusion", () => {
  it("最初の句点までを1文目、残りを2文目以降にする", () => {
    expect(splitConclusion("架空の1文目。架空の2文目。")).toEqual({
      first: "架空の1文目。",
      rest: "架空の2文目。",
    })
  })

  it("コードの中の句点では割らない", () => {
    expect(splitConclusion("架空の `a。b` を直した。残りの文。")).toEqual({
      first: "架空の `a。b` を直した。",
      rest: "残りの文。",
    })
  })

  it("句点が無い・句点が末尾だけなら全部を1文目にする", () => {
    expect(splitConclusion("句点の無い文")).toEqual({ first: "句点の無い文", rest: "" })
    expect(splitConclusion("1文だけ。")).toEqual({ first: "1文だけ。", rest: "" })
  })
})
