import { describe, expect, it } from "vitest"

import { isMissingFileError } from "../../../../src/server/adapter/lib/missing-file-error.ts"

function errorWithCode(code: string): Error {
  return Object.assign(new Error("架空の失敗"), { code })
}

describe("isMissingFileError", () => {
  it("ENOENT のコードを持つ Error は true", () => {
    expect(isMissingFileError(errorWithCode("ENOENT"))).toBe(true)
  })

  it("ほかのコードの Error・コードの無い Error は false", () => {
    expect(isMissingFileError(errorWithCode("EACCES"))).toBe(false)
    expect(isMissingFileError(new Error("架空の失敗"))).toBe(false)
  })

  it("Error でない値は false", () => {
    expect(isMissingFileError({ code: "ENOENT" })).toBe(false)
    expect(isMissingFileError(undefined)).toBe(false)
  })
})
