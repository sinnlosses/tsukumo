import { describe, expect, it } from "vitest"
import { z } from "zod"

import { structuredOutputSchema } from "../../../src/server/core/structured-output-schema.ts"

describe("structuredOutputSchema", () => {
  it("$schema は draft-07 で出す（2020-12 だと SDK の子プロセスが no schema with key or ref で落ちる）", () => {
    const schema = structuredOutputSchema(z.object({ a: z.string() }))

    expect(schema["$schema"]).toBe("http://json-schema.org/draft-07/schema#")
  })

  it("字数・件数・列挙・整数の下限を JSON Schema のキーワードとして残す", () => {
    const schema = structuredOutputSchema(
      z.object({
        title: z.string().trim().min(1).max(20),
        cues: z.array(z.string()).min(1).max(10),
        key: z.enum(["a", "b"]),
        end: z.number().int().min(1),
      }),
    )

    expect(schema).toMatchObject({
      type: "object",
      required: ["title", "cues", "key", "end"],
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1, maxLength: 20 },
        cues: { type: "array", minItems: 1, maxItems: 10 },
        key: { enum: ["a", "b"] },
        end: { type: "integer", minimum: 1 },
      },
    })
  })

  it(".refine は JSON Schema に出ず、投げない", () => {
    const schema = structuredOutputSchema(
      z.object({ text: z.string().refine((value) => !value.includes("\n")) }),
    )

    expect(schema).toMatchObject({ properties: { text: { type: "string" } } })
  })

  it(".transform を含む形は投げる", () => {
    expect(() =>
      structuredOutputSchema(z.object({ text: z.string().transform((value) => value.length) })),
    ).toThrow(/cannot be represented/)
  })
})
