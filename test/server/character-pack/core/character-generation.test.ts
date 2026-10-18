import { describe, expect, it } from "vitest"

import {
  type CharacterGenerationQuery,
  generateCharacter,
  toGeneratedCharacter,
} from "../../../../src/server/character-pack/core/character-generation.ts"
import { MAX_CHARACTER_NAME_LENGTH } from "../../../../src/shared/character-pack/character-definition.ts"
import {
  MAX_PERSONA_BODY_LENGTH,
  REMEMBERED_SECTION_HEADING,
} from "../../../../src/shared/character-pack/persona-section.ts"

/** 形の合う生成の出力（手で書いた架空のキャラクター）。 */
const GENERATED = {
  id: "fictional-2",
  name: "架空の2号",
  accent: "#b8c7ff",
  chatAccent: "#EAA77A",
  persona: "# 架空の2号\n\n架空の人格。",
}

const PORTRAIT_BASE64 = "AAAA"
const PORTRAIT_PNG_DATA_URL = `data:image/png;base64,${PORTRAIT_BASE64}`

const NOT_ABORTED = new AbortController().signal

describe("toGeneratedCharacter", () => {
  it("形の合う出力をそのまま欄の値にする", () => {
    expect(toGeneratedCharacter(GENERATED)).toEqual(GENERATED)
  })

  it("パックの名前として通らない id は空文字に畳み、ほかの欄は残す", () => {
    for (const id of ["架空", ".hidden", "with space", "nested/name", 42]) {
      expect(toGeneratedCharacter({ ...GENERATED, id })).toEqual({ ...GENERATED, id: "" })
    }
  })

  it("id 以外の欄が形に合わなければ undefined", () => {
    const broken = [
      { ...GENERATED, accent: "b8c7ff" },
      { ...GENERATED, chatAccent: "#b8c7f" },
      { ...GENERATED, name: " " },
      { ...GENERATED, name: "あ".repeat(MAX_CHARACTER_NAME_LENGTH + 1) },
      { ...GENERATED, persona: "\n" },
      { ...GENERATED, persona: "あ".repeat(MAX_PERSONA_BODY_LENGTH + 1) },
      { ...GENERATED, persona: `# 架空の2号\n\n${REMEMBERED_SECTION_HEADING}\n\n- 架空の1行` },
      { ...GENERATED, persona: undefined },
    ]

    for (const value of broken) {
      expect(toGeneratedCharacter(value)).toBeUndefined()
    }
  })

  it("object でない値は undefined", () => {
    for (const value of [undefined, "文字列", [GENERATED]]) {
      expect(toGeneratedCharacter(value)).toBeUndefined()
    }
  })
})

describe("generateCharacter", () => {
  it("立ち絵を画像1枚として Opus の問い合わせに渡し、検査した欄の値を返す", async () => {
    const requests: CharacterGenerationQuery[] = []

    const generated = await generateCharacter(
      (request) => {
        requests.push(request)
        return Promise.resolve(GENERATED)
      },
      PORTRAIT_PNG_DATA_URL,
      NOT_ABORTED,
    )

    expect(generated).toEqual(GENERATED)
    expect(requests.map((request) => [request.model, request.image])).toEqual([
      ["opus", { mediaType: "image/png", base64: PORTRAIT_BASE64 }],
    ])
  })

  it("問い合わせが投げたら投げ直さず undefined", async () => {
    expect(
      await generateCharacter(
        () => Promise.reject(new Error("架空の失敗")),
        PORTRAIT_PNG_DATA_URL,
        NOT_ABORTED,
      ),
    ).toBeUndefined()
  })

  it("モデルへ渡せない立ち絵では問い合わせを起こさない", async () => {
    const requests: CharacterGenerationQuery[] = []

    const generated = await generateCharacter(
      (request) => {
        requests.push(request)
        return Promise.resolve(GENERATED)
      },
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      NOT_ABORTED,
    )

    expect(generated).toBeUndefined()
    expect(requests).toEqual([])
  })
})
