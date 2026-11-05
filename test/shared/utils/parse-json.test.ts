import { describe, expect, it } from "vitest"
import { z } from "zod"

import { parseJsonWith } from "../../../src/shared/utils/parse-json.ts"

describe("parseJsonWith", () => {
  const schema = z.object({ n: z.number() })

  it("スキーマに合う JSON は値を返す", () => {
    expect(parseJsonWith(schema, '{"n":1}')).toEqual({ n: 1 })
  })

  it("壊れた JSON は undefined", () => {
    expect(parseJsonWith(schema, "{")).toBeUndefined()
  })

  it("形が違う JSON は undefined", () => {
    expect(parseJsonWith(schema, '{"n":"x"}')).toBeUndefined()
  })
})
