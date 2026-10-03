import { describe, expect, it } from "vitest"

import {
  parseWelcomeGreeting,
  timeBandOf,
  WELCOME_GREETING_CHARS,
  welcomeGreetingQuery,
  type WelcomeGreetingMaterial,
} from "../../../../src/server/recommendation/core/welcome-greeting.ts"

// すべて手で書いた架空の材料と出力。

const MATERIAL: WelcomeGreetingMaterial = {
  persona: "# 架空の人格\n\n架空の口調で話す。",
  expressions: [
    { name: "default", label: "架空のふつう" },
    { name: "excited", label: "架空のわくわく" },
  ],
  calendar: { month: 10, dayOfWeek: 6, hour: 8 },
  recent: [{ withCard: "架空の前の挨拶、{札} だ", withoutCard: "架空の前の挨拶" }],
}

const OUTPUT = {
  withCard: "架空の挨拶、{札} からいこう",
  withoutCard: "架空の挨拶だけ",
  expression: "excited",
}

describe("welcomeGreetingQuery", () => {
  it("人格を指示文の前に置き、材料・表情の選択肢・直近の挨拶を依頼の文面に書く", () => {
    const query = welcomeGreetingQuery(MATERIAL)

    expect(query.systemPrompt.startsWith("# 架空の人格")).toBe(true)
    expect(query.prompt).toContain("- 月: 10月")
    expect(query.prompt).toContain("- 曜日: 土曜")
    expect(query.prompt).toContain("- 時刻の帯: 朝")
    expect(query.prompt).toContain("- excited: 架空のわくわく")
    expect(query.prompt).toContain("- 架空の前の挨拶、{札} だ")
  })

  it("人格が空なら指示文だけ", () => {
    const query = welcomeGreetingQuery({ ...MATERIAL, persona: "" })

    expect(query.systemPrompt.startsWith("あなたはいま")).toBe(true)
  })

  it("出力の表情を選択肢の名前に限る", () => {
    expect(welcomeGreetingQuery(MATERIAL).schema).toMatchObject({
      properties: { expression: { enum: ["default", "excited"] } },
    })
  })
})

describe("parseWelcomeGreeting", () => {
  it("検査を通れば、前後の空白を落とした挨拶にする", () => {
    expect(
      parseWelcomeGreeting({ ...OUTPUT, withoutCard: " 架空の挨拶だけ \n" }, MATERIAL),
    ).toEqual(OUTPUT)
  })

  it.each<[string, Record<string, unknown>]>([
    ["札ありの文に差し込み口が無い", { withCard: "架空の挨拶" }],
    ["札ありの文に差し込み口が2つある", { withCard: "{札} と {札}" }],
    ["札なしの文に差し込み口がある", { withoutCard: "{札} だけ" }],
    ["空", { withoutCard: "  " }],
    ["改行入り", { withoutCard: "架空の\n挨拶" }],
    ["上限を超える", { withoutCard: "あ".repeat(WELCOME_GREETING_CHARS + 1) }],
    ["知らない表情", { expression: "架空の表情" }],
    ["直近と同じ札ありの文", { withCard: "架空の前の挨拶、{札} だ" }],
    ["直近と同じ札なしの文", { withoutCard: "架空の前の挨拶" }],
    ["文字列でない", { withCard: 1 }],
  ])("%s なら落とす", (_, patch) => {
    expect(parseWelcomeGreeting({ ...OUTPUT, ...patch }, MATERIAL)).toBeUndefined()
  })

  it("オブジェクトでなければ落とす", () => {
    expect(parseWelcomeGreeting("架空", MATERIAL)).toBeUndefined()
  })
})

describe("timeBandOf", () => {
  it.each<[number, string]>([
    [0, "深夜"],
    [4, "深夜"],
    [5, "朝"],
    [9, "朝"],
    [10, "昼"],
    [15, "昼"],
    [16, "夕方"],
    [18, "夕方"],
    [19, "夜"],
    [23, "夜"],
  ])("%d 時は %s", (hour, band) => {
    expect(timeBandOf(hour)).toBe(band)
  })
})
