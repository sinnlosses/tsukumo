import { describe, expect, it } from "vitest"

import type { RecommendationCandidate } from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import {
  parseRecommendationResult,
  RECOMMENDATION_REASON_CHARS,
  recommendationQuery,
} from "../../../../src/server/recommendation/core/recommendation.ts"

// すべて手で書いた架空の候補。

const CANDIDATES: readonly RecommendationCandidate[] = [
  { kind: "resume" },
  { kind: "task", id: "X-002", summary: "架空の重い直し", waitedBy: ["X-003"] },
  { kind: "task", id: "X-005", summary: "架空の軽い直し", waitedBy: [] },
  { kind: "task", id: "X-007", summary: "架空の別の直し", waitedBy: [] },
]

describe("recommendationQuery", () => {
  it("出力のキーを候補のキーに限る", () => {
    const { schema } = recommendationQuery(CANDIDATES)

    expect(schema).toMatchObject({
      properties: {
        cards: { items: { properties: { key: { enum: ["resume", "X-002", "X-005", "X-007"] } } } },
      },
    })
  })
})

describe("parseRecommendationResult", () => {
  it("候補のキーを札にし、前回の続きは中身を持たない札にする", () => {
    expect(
      parseRecommendationResult(
        {
          cards: [
            { key: "X-002", reason: " 架空の効き目の理由 " },
            { key: "resume", reason: "架空のつながりの理由" },
          ],
        },
        CANDIDATES,
      ),
    ).toEqual([
      { kind: "task", taskId: "X-002", reason: "架空の効き目の理由" },
      { kind: "resume", reason: "架空のつながりの理由" },
    ])
  })

  it("候補に無いキー・重複・空や改行入りや長すぎる理由の件を1件ずつ落とし、3件で切る", () => {
    expect(
      parseRecommendationResult(
        {
          cards: [
            { key: "X-999", reason: "架空の理由" },
            { key: "X-002", reason: "" },
            { key: "X-002", reason: "架空の理由1" },
            { key: "X-002", reason: "架空の理由2" },
            { key: "X-005", reason: "架空の\n理由" },
            { key: "X-005", reason: "あ".repeat(RECOMMENDATION_REASON_CHARS + 1) },
            { key: "X-005", reason: "架空の理由3" },
            { key: "resume", reason: "架空の理由4" },
            { key: "X-007", reason: "架空の理由5" },
          ],
        },
        CANDIDATES,
      ),
    ).toEqual([
      { kind: "task", taskId: "X-002", reason: "架空の理由1" },
      { kind: "task", taskId: "X-005", reason: "架空の理由3" },
      { kind: "resume", reason: "架空の理由4" },
    ])
  })

  it("形が崩れている・1件も残らないときは何も返さない", () => {
    expect(parseRecommendationResult({ cards: "架空" }, CANDIDATES)).toBeUndefined()
    expect(
      parseRecommendationResult({ cards: [{ key: "X-999", reason: "架空" }] }, CANDIDATES),
    ).toBeUndefined()
  })
})
