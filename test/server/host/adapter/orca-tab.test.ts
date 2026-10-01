import { describe, expect, it } from "vitest"

import {
  parseOrcaCreatedPageId,
  parseOrcaTabList,
} from "../../../../src/server/host/adapter/orca-tab.ts"

describe("parseOrcaTabList", () => {
  it("result.tabs の要素から、3つのフィールドが揃ったタブだけを採る", () => {
    const value = {
      result: {
        tabs: [
          { browserPageId: "a", url: "http://127.0.0.1:7327/", title: "tsukumo" },
          { browserPageId: "b", url: "http://127.0.0.1:7328/" },
          { url: "http://127.0.0.1:7329/", title: "欠けている" },
          "文字列",
        ],
      },
    }

    expect(parseOrcaTabList(value)).toEqual([
      { pageId: "a", url: "http://127.0.0.1:7327/", title: "tsukumo" },
    ])
  })

  it("result が無い・tabs が配列でない・JSON として崩れた値は空にする", () => {
    expect(parseOrcaTabList({ result: {} })).toEqual([])
    expect(parseOrcaTabList({ result: { tabs: "not-an-array" } })).toEqual([])
    expect(parseOrcaTabList(undefined)).toEqual([])
    expect(parseOrcaTabList("not-json")).toEqual([])
  })
})

describe("parseOrcaCreatedPageId", () => {
  it("result.browserPageId を取り出す", () => {
    expect(parseOrcaCreatedPageId({ result: { browserPageId: "c5aefa7b" } })).toBe("c5aefa7b")
  })

  it("result が無い・browserPageId が文字列でない・JSON として崩れた値は undefined にする", () => {
    expect(parseOrcaCreatedPageId({})).toBeUndefined()
    expect(parseOrcaCreatedPageId({ result: { browserPageId: 1 } })).toBeUndefined()
    expect(parseOrcaCreatedPageId(undefined)).toBeUndefined()
  })
})
