import { describe, expect, it } from "vitest"

import { expectEveryFieldKept } from "./record-field.ts"

const entry = { at: 1, models: [{ model: "m", costUsd: 2 }], breakdown: { main: { steps: 3 } } }

describe("expectEveryFieldKept", () => {
  it("入力の欄が全部残っていれば通る（出力の余分な欄は構わない）", () => {
    expect(() => {
      expectEveryFieldKept(entry, { ...entry, v: 3 })
    }).not.toThrow()
  })

  it("最上位の欄を1つ欠くと落ちる", () => {
    expect(() => {
      expectEveryFieldKept(entry, { models: entry.models, breakdown: entry.breakdown })
    }).toThrow(/'at'/)
  })

  it("配列の要素の中や入れ子の中の欄を欠いても落ちる", () => {
    expect(() => {
      expectEveryFieldKept(entry, { ...entry, models: [{ model: "m" }] })
    }).toThrow(/models\.0\.costUsd/)
    expect(() => {
      expectEveryFieldKept(entry, { ...entry, breakdown: { main: {} } })
    }).toThrow(/breakdown\.main\.steps/)
  })

  it("意図して写さない欄は ignored に挙げれば通る", () => {
    expect(() => {
      expectEveryFieldKept(entry, { ...entry, models: [{ model: "m" }] }, ["models.0.costUsd"])
    }).not.toThrow()
  })
})
