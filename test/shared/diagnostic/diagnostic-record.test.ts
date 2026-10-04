import { describe, expectTypeOf, it } from "vitest"

import type { DiagnosticRecord } from "../../../src/shared/diagnostic/diagnostic-record.ts"

/** どれかの流れで、任意の文字列を受ける欄の名前（無ければ `never`）。 */
type FreeTextKey<T> = T extends unknown
  ? { [K in keyof T]-?: string extends T[K] ? K : never }[keyof T]
  : never

describe("DiagnosticRecord", () => {
  it("任意の文字列を受ける欄が無い", () => {
    expectTypeOf<FreeTextKey<DiagnosticRecord>>().toEqualTypeOf<never>()
  })

  it("任意の文字列を受ける欄があれば、その名前を拾う", () => {
    type Leaky =
      | { readonly flow: "a"; readonly message: string }
      | { readonly flow: "b"; readonly name: string | undefined }
    expectTypeOf<FreeTextKey<Leaky>>().toEqualTypeOf<"message" | "name">()
  })
})
