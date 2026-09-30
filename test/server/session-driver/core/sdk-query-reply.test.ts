import { describe, expect, it } from "vitest"

import {
  toCommandDescriptions,
  toModelEffortSupport,
  toPlan,
} from "../../../../src/server/session-driver/core/sdk-query-reply.ts"

describe("toCommandDescriptions", () => {
  it("名前と説明の組にする", () => {
    expect(
      toCommandDescriptions([{ name: "clear", description: "会話をリセットする", aliases: [] }]),
    ).toEqual([{ name: "clear", description: "会話をリセットする" }])
  })

  it("説明が空文字・文字列でないものは説明なし（undefined）にする", () => {
    expect(
      toCommandDescriptions([
        { name: "model", description: "" },
        { name: "compact", description: 7 },
        { name: "usage" },
      ]),
    ).toEqual([
      { name: "model", description: undefined },
      { name: "compact", description: undefined },
      { name: "usage", description: undefined },
    ])
  })

  it("名前が無い・空の要素は捨てる", () => {
    expect(toCommandDescriptions([{ description: "名無し" }, { name: "" }, "clear", null])).toEqual(
      [],
    )
  })

  it("配列でない値は空配列にする", () => {
    expect(toCommandDescriptions(undefined)).toEqual([])
    expect(toCommandDescriptions({ commands: [] })).toEqual([])
  })
})

describe("toPlan", () => {
  it("subscriptionType をそのまま返す（知らない値でも直さず出す）", () => {
    expect(toPlan({ subscriptionType: "max" })).toBe("max")
    expect(toPlan({ subscriptionType: "未来の値" })).toBe("未来の値")
  })

  it("email / organization は戻り値に出ない", () => {
    const plan = toPlan({
      subscriptionType: "max",
      email: "架空@example.com",
      organization: "架空組織",
    })

    expect(plan).toBe("max")
  })

  it("subscriptionType が無い・空文字・文字列でないときは undefined", () => {
    expect(toPlan({})).toBeUndefined()
    expect(toPlan({ subscriptionType: "" })).toBeUndefined()
    expect(toPlan({ subscriptionType: 7 })).toBeUndefined()
  })

  it("API キー・Bedrock のときのような、他のフィールドしか無い形でも undefined", () => {
    expect(toPlan({ apiProvider: "bedrock", tokenSource: "aws" })).toBeUndefined()
  })

  it("オブジェクトでない値は undefined にする", () => {
    expect(toPlan(undefined)).toBeUndefined()
    expect(toPlan(null)).toBeUndefined()
    expect(toPlan("max")).toBeUndefined()
  })
})

describe("toModelEffortSupport", () => {
  it("value・supportsEffort・supportedEffortLevels を取り出す（実測: supportedModels() の形）", () => {
    expect(
      toModelEffortSupport([
        {
          value: "opus",
          resolvedModel: "claude-opus-5-5",
          displayName: "Opus 5.5",
          description: "架空の説明",
          supportsEffort: true,
          supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
        },
        { value: "haiku", resolvedModel: "claude-haiku-4-5", displayName: "Haiku 4.5" },
      ]),
    ).toEqual([
      {
        model: "opus",
        supportsEffort: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      { model: "haiku", supportsEffort: false, effortLevels: [] },
    ])
  })

  it("知らない段の値は落とす。supportedEffortLevels が配列でなければ空にする", () => {
    expect(
      toModelEffortSupport([
        {
          value: "opus",
          supportsEffort: true,
          supportedEffortLevels: ["low", "未来の段", 7, "max"],
        },
        { value: "sonnet", supportsEffort: true, supportedEffortLevels: "high" },
      ]),
    ).toEqual([
      { model: "opus", supportsEffort: true, effortLevels: ["low", "max"] },
      { model: "sonnet", supportsEffort: true, effortLevels: [] },
    ])
  })

  it("value が文字列でない要素は捨てる。配列でない値は空配列にする", () => {
    expect(toModelEffortSupport([{ supportsEffort: true }, { value: 7 }, "opus", null])).toEqual([])
    expect(toModelEffortSupport(undefined)).toEqual([])
    expect(toModelEffortSupport({ models: [] })).toEqual([])
  })
})
