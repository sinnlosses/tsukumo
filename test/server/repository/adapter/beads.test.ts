import { describe, expect, it } from "vitest"

import { beadsOutcomeOf } from "../../../../src/server/repository/adapter/beads.ts"

function issueOf(extra: Record<string, unknown>): unknown {
  return {
    id: "gh-1",
    title: "架空の題",
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  }
}

function attributesOf(extra: Record<string, unknown>) {
  const outcome = beadsOutcomeOf(JSON.stringify([issueOf(extra)]))
  if (outcome.kind !== "issues") {
    throw new Error("読めるはず")
  }
  const [issue] = outcome.issues
  if (issue === undefined) {
    throw new Error("課題が残るはず")
  }
  return { difficulty: issue.difficulty, loopable: issue.loopable, labels: issue.labels }
}

function priorityOf(extra: Record<string, unknown>) {
  const outcome = beadsOutcomeOf(JSON.stringify([issueOf(extra)]))
  const issue = outcome.kind === "issues" ? outcome.issues[0] : undefined
  if (issue === undefined) {
    throw new Error("課題が残るはず")
  }
  return { importance: issue.importance, urgency: issue.urgency }
}

function draftOf(extra: Record<string, unknown>): boolean | undefined {
  const outcome = beadsOutcomeOf(JSON.stringify([issueOf(extra)]))
  return outcome.kind === "issues" ? outcome.issues[0]?.draft : undefined
}

describe("beadsOutcomeOf の metadata", () => {
  it("draft が Y なら draft、無いか Y 以外なら draft でない", () => {
    expect(draftOf({ metadata: { draft: "Y" } })).toBe(true)
    expect(draftOf({ metadata: {} })).toBe(false)
    expect(draftOf({ metadata: { draft: "N" } })).toBe(false)
  })

  it("difficulty と loopable を読む", () => {
    expect(attributesOf({ metadata: { difficulty: "sonnet", loopable: "Y" } })).toMatchObject({
      difficulty: "sonnet",
      loopable: "Y",
    })
  })

  it("importance と urgency を読む", () => {
    expect(priorityOf({ metadata: { importance: "high", urgency: "low" } })).toEqual({
      importance: "high",
      urgency: "low",
    })
  })

  it.each([
    ["欄なし", {}],
    ["metadata が null", { metadata: null }],
    ["キーなし", { metadata: {} }],
    ["語彙の外", { metadata: { importance: "urgent", urgency: "HIGH" } }],
    ["文字列でない値", { metadata: { importance: 3, urgency: null } }],
  ])("importance と urgency は%sなら normal", (_name, extra) => {
    expect(priorityOf(extra)).toEqual({ importance: "normal", urgency: "normal" })
  })

  it("ほかのキーは無視する", () => {
    expect(
      attributesOf({ metadata: { difficulty: "opus", loopable: "N", task_plan_base: "x" } }),
    ).toMatchObject({ difficulty: "opus", loopable: "N" })
  })

  it("表に無い値は undefined にし、課題は残す", () => {
    expect(attributesOf({ metadata: { difficulty: "gpt", loopable: "y" } })).toMatchObject({
      difficulty: undefined,
      loopable: undefined,
    })
  })

  it("文字列でない値は undefined", () => {
    expect(attributesOf({ metadata: { difficulty: 3 } }).difficulty).toBeUndefined()
  })

  it.each([
    ["null", { metadata: null }],
    ["欄なし", {}],
    ["配列", { metadata: ["sonnet"] }],
  ])("metadata が%sでも課題は残り、属性は undefined", (_name, extra) => {
    expect(attributesOf(extra)).toMatchObject({ difficulty: undefined, loopable: undefined })
  })

  it("label からは読まず、labels は字のまま", () => {
    expect(attributesOf({ labels: ["difficulty:opus"] })).toEqual({
      difficulty: undefined,
      loopable: undefined,
      labels: ["difficulty:opus"],
    })
  })
})
