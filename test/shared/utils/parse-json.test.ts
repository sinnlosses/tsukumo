import { describe, expect, it } from "vitest"

import { parseJson } from "../../../src/shared/utils/parse-json.ts"

describe("parseJson", () => {
  it("正しい JSON は値のまま返す", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseJson("[1,2]")).toEqual([1, 2])
    expect(parseJson("3")).toBe(3)
  })

  it("壊れた JSON は undefined を返す", () => {
    expect(parseJson("{")).toBeUndefined()
  })

  it("空文字は undefined を返す", () => {
    expect(parseJson("")).toBeUndefined()
  })
})
