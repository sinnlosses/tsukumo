import { describe, expect, it } from "vitest"

import {
  AWAY_BANDS,
  awayBandOf,
  parseWelcomeGreeting,
  timeBandOf,
  welcomeGreetingQuery,
  type WelcomeGreetingMaterial,
} from "../../../../src/server/recommendation/core/welcome-greeting.ts"
import {
  WELCOME_LINE_CHARS,
  WELCOME_LINE_REQUESTED_CHARS,
} from "../../../../src/server/recommendation/core/welcome-line.ts"
import type { WelcomeRejection } from "../../../../src/shared/diagnostic/welcome-writing.ts"

// すべて手で書いた架空の材料と出力。

const MATERIAL: WelcomeGreetingMaterial = {
  persona: "# 架空の人格\n\n架空の口調で話す。",
  expressions: [
    { name: "default", label: "架空のふつう" },
    { name: "excited", label: "架空のわくわく" },
  ],
  calendar: { month: 10, dayOfWeek: 6, hour: 8 },
  visit: { kind: "start" },
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

  it("新しく起こしたときは迎え方だけを書き、前回からの行を書かない", () => {
    const query = welcomeGreetingQuery(MATERIAL)

    expect(query.prompt).toContain("- 迎え方: 新しく始める")
    expect(query.prompt).not.toContain("- 前回から:")
  })

  it("続きから起こしたときは、続きからの印と前回からの経過の帯を書き、指示文に続きから迎えるときの節がある", () => {
    const query = welcomeGreetingQuery({ ...MATERIAL, visit: { kind: "resume", away: "数時間" } })

    expect(query.prompt).toContain("- 迎え方: 前回の続きに戻ってきた")
    expect(query.prompt).toContain("- 前回から: 数時間")
    expect(query.systemPrompt).toContain("## 続きから迎えるとき")
  })

  it("人格が空なら指示文だけ", () => {
    const query = welcomeGreetingQuery({ ...MATERIAL, persona: "" })

    expect(query.systemPrompt.startsWith("あなたはいま")).toBe(true)
  })

  it("指示文は検査の上限より短い字数を頼む", () => {
    const { systemPrompt } = welcomeGreetingQuery(MATERIAL)

    expect(systemPrompt).toContain(`${String(WELCOME_LINE_REQUESTED_CHARS)}字まで`)
    expect(systemPrompt).not.toContain(`${String(WELCOME_LINE_CHARS)}字まで`)
  })

  it("出力の形は挨拶の2文と表情だけで、表情を選択肢の名前に限る", () => {
    expect(welcomeGreetingQuery(MATERIAL).schema).toMatchObject({
      properties: { expression: { enum: ["default", "excited"] } },
      required: ["withCard", "withoutCard", "expression"],
      additionalProperties: false,
    })
  })
})

describe("parseWelcomeGreeting", () => {
  it("検査を通れば、前後の空白を落とした挨拶にする", () => {
    expect(
      parseWelcomeGreeting({ ...OUTPUT, withoutCard: " 架空の挨拶だけ \n" }, MATERIAL),
    ).toEqual({ kind: "accepted", value: OUTPUT })
  })

  it.each<[string, Record<string, unknown>, WelcomeRejection]>([
    ["札ありの文に差し込み口が無い", { withCard: "架空の挨拶" }, "mark-count"],
    ["札ありの文に差し込み口が2つある", { withCard: "{札} と {札}" }, "mark-count"],
    ["札なしの文に差し込み口がある", { withoutCard: "{札} だけ" }, "mark-count"],
    ["空", { withoutCard: "  " }, "empty"],
    ["改行入り", { withoutCard: "架空の\n挨拶" }, "newline"],
    ["上限を超える", { withoutCard: "あ".repeat(WELCOME_LINE_CHARS + 1) }, "too-long"],
    ["知らない表情", { expression: "架空の表情" }, "unknown-expression"],
    ["表情が無い", { expression: undefined }, "missing"],
    ["直近と同じ札ありの文", { withCard: "架空の前の挨拶、{札} だ" }, "repeated"],
    ["直近と同じ札なしの文", { withoutCard: "架空の前の挨拶" }, "repeated"],
    ["文字列でない", { withCard: 1 }, "missing"],
  ])("%s なら落とす", (_, patch, reason) => {
    expect(parseWelcomeGreeting({ ...OUTPUT, ...patch }, MATERIAL)).toEqual({
      kind: "rejected",
      reason,
    })
  })

  it("頼んだ字数を超えても、検査の上限ちょうどまでの文は通す", () => {
    const longest = "あ".repeat(WELCOME_LINE_CHARS)
    expect(WELCOME_LINE_REQUESTED_CHARS).toBeLessThan(WELCOME_LINE_CHARS)

    expect(parseWelcomeGreeting({ ...OUTPUT, withoutCard: longest }, MATERIAL)).toMatchObject({
      kind: "accepted",
      value: { withoutCard: longest },
    })
  })

  it("オブジェクトでなければ落とす", () => {
    expect(parseWelcomeGreeting("架空", MATERIAL)).toEqual({ kind: "rejected", reason: "missing" })
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

describe("awayBandOf", () => {
  it("境目の手前はその帯、境目ちょうどは次の帯", () => {
    for (const [index, entry] of AWAY_BANDS.entries()) {
      expect(awayBandOf(entry.belowMs - 1)).toBe(entry.band)
      expect(awayBandOf(entry.belowMs)).toBe(AWAY_BANDS[index + 1]?.band ?? "1週間以上")
    }
  })

  it("0 は最初の帯", () => {
    expect(awayBandOf(0)).toBe("1時間たらず")
  })
})
