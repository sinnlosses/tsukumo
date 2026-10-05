import { describe, expect, it } from "vitest"

import {
  NO_REACTIONS,
  toCharacterReactions,
} from "../../../src/shared/character-pack/character-reaction.ts"

describe("toCharacterReactions", () => {
  it.each<[string, unknown]>([
    ["節が無い", undefined],
    ["オブジェクトでない", ["架空の文"]],
  ])("%sときは、どの出来事も空", (_, value) => {
    expect(toCharacterReactions(value)).toEqual(NO_REACTIONS)
  })

  it("形の崩れた行だけを落とし、ほかの行と出来事は残す", () => {
    const reactions = toCharacterReactions({
      retrying: [
        { text: "架空の再試行", expression: "thinking" },
        { text: "   ", expression: "default" },
        { text: "表情が知らない名前", expression: "架空の表情" },
        { expression: "default" },
        "文字列だけの行",
      ],
      failed: "配列でない",
      limited: [{ text: "架空の上限", expression: "sad" }],
    })

    expect(reactions).toEqual({
      ...NO_REACTIONS,
      retrying: [{ text: "架空の再試行", expression: "thinking" }],
      limited: [{ text: "架空の上限", expression: "sad" }],
    })
  })
})
