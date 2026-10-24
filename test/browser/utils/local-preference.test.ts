import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../../../src/browser/utils/local-preference.ts"

const KEY = "tsukumo-test-preference:v1"
const schema = z.object({ size: z.number().min(1).max(9) })
const FALLBACK = { size: 5 }

beforeEach(() => {
  localStorage.removeItem(KEY)
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(KEY)
})

describe("localPreference の読み", () => {
  it("保存が無いときは fallback を返す", () => {
    expect(localPreference(KEY, schema, FALLBACK).load()).toEqual(FALLBACK)
  })

  it("schema に通る JSON はそのまま読む", () => {
    localStorage.setItem(KEY, '{"size":3}')

    expect(localPreference(KEY, schema, FALLBACK).load()).toEqual({ size: 3 })
  })

  it("JSON として壊れた値と schema に通らない値は fallback に畳む", () => {
    const preference = localPreference(KEY, schema, FALLBACK)

    localStorage.setItem(KEY, "{not json")
    expect(preference.load()).toEqual(FALLBACK)

    localStorage.setItem(KEY, '{"size":99}')
    expect(preference.load()).toEqual(FALLBACK)
  })

  it("getItem が throw しても fallback を返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    expect(localPreference(KEY, schema, FALLBACK).load()).toEqual(FALLBACK)
  })
})

describe("localPreference の書き", () => {
  it("書いた値を同じ鍵から読み戻せ、保存形式は JSON", () => {
    const preference = localPreference(KEY, schema, FALLBACK)

    preference.save({ size: 7 })

    expect(localStorage.getItem(KEY)).toBe('{"size":7}')
    expect(preference.load()).toEqual({ size: 7 })
  })

  it("setItem が throw しても例外を投げない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })

    expect(() => {
      localPreference(KEY, schema, FALLBACK).save({ size: 2 })
    }).not.toThrow()
  })
})

describe("localPreference の codec", () => {
  it("生文字列の codec は引用符なしで保存し、保存済みの生文字列を読む", () => {
    const preference = localPreference(KEY, z.enum(["a", "b"]), "a", RAW_STRING_CODEC)
    localStorage.setItem(KEY, "b")

    expect(preference.load()).toBe("b")

    preference.save("a")
    expect(localStorage.getItem(KEY)).toBe("a")
  })

  it("codec の parse が throw しても fallback を返す", () => {
    localStorage.setItem(KEY, "x")
    const preference = localPreference(KEY, z.number(), 0, {
      parse: () => {
        throw new Error("unreadable")
      },
      serialize: String,
    })

    expect(preference.load()).toBe(0)
  })
})
