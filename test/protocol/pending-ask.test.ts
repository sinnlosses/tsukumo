import { describe, expect, it } from "bun:test"

import { parseAnswer } from "../../src/protocol/pending-ask.ts"

describe("parseAnswer", () => {
  it("allow / deny をそのまま受け取る", () => {
    expect(parseAnswer({ kind: "allow" })).toEqual({ kind: "allow" })
    expect(parseAnswer({ kind: "deny" })).toEqual({ kind: "deny" })
  })

  it("answers は質問ごとの並びをそのまま受け取る（自由入力の文字列も受けられる）", () => {
    expect(
      parseAnswer({ kind: "answers", labels: [["選択肢A", "自由入力の答え"], ["選択肢B"]] }),
    ).toEqual({
      kind: "answers",
      labels: [["選択肢A", "自由入力の答え"], ["選択肢B"]],
    })
  })

  it("kind が無い・知らない値は undefined を返す", () => {
    expect(parseAnswer({})).toBeUndefined()
    expect(parseAnswer({ kind: "maybe" })).toBeUndefined()
    expect(parseAnswer("allow")).toBeUndefined()
    expect(parseAnswer(null)).toBeUndefined()
  })

  it("answers の labels が「文字列の配列」の配列でないときは undefined を返す", () => {
    expect(parseAnswer({ kind: "answers", labels: [1, 2] })).toBeUndefined()
    expect(parseAnswer({ kind: "answers", labels: ["答え"] })).toBeUndefined()
    expect(parseAnswer({ kind: "answers", labels: "答え" })).toBeUndefined()
    expect(parseAnswer({ kind: "answers" })).toBeUndefined()
  })
})
