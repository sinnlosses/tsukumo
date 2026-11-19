import { describe, expect, it } from "vitest"

import type { RecommendationCandidate } from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import {
  parseRecommendationResult,
  recommendationQuery,
} from "../../../../src/server/recommendation/core/recommendation.ts"

// すべて手で書いた架空の候補。

type TaskCandidate = Extract<RecommendationCandidate, { readonly kind: "task" }>

function taskCandidate(
  id: string,
  summary: string,
  overrides: Partial<TaskCandidate> = {},
): TaskCandidate {
  return {
    kind: "task",
    id,
    summary,
    waitedBy: [],
    difficulty: "sonnet",
    importance: "normal",
    urgency: "normal",
    followsDoneWork: false,
    ...overrides,
  }
}

const CANDIDATES: readonly RecommendationCandidate[] = [
  { kind: "resume" },
  taskCandidate("X-002", "架空の重い直し", { waitedBy: ["X-003"] }),
  taskCandidate("X-005", "架空の軽い直し"),
  taskCandidate("X-007", "架空の別の直し"),
]

describe("recommendationQuery", () => {
  it("渡したモデルを問い合わせに載せる", () => {
    expect(recommendationQuery(CANDIDATES, "opus").model).toBe("opus")
  })

  it("出力のキーを候補のキーに限る", () => {
    const { schema } = recommendationQuery(CANDIDATES, "haiku")

    expect(schema).toMatchObject({
      properties: {
        cards: { items: { properties: { key: { enum: ["resume", "X-002", "X-005", "X-007"] } } } },
      },
    })
  })

  it("札は1件から候補の数までで、理由の字数の上限も出力の形に出す", () => {
    const { schema } = recommendationQuery(CANDIDATES, "haiku")

    expect(schema).toMatchObject({
      required: ["cards"],
      properties: {
        cards: {
          minItems: 1,
          maxItems: 4,
          items: { properties: { reason: { type: "string", minLength: 1, maxLength: 40 } } },
        },
      },
    })
  })

  it("タスクの候補の行に、並べた決め手（印・待っているタスクの件数・難しさ・前の作業）を書く", () => {
    const { prompt } = recommendationQuery(
      [
        { kind: "resume" },
        taskCandidate("X-002", "架空の急ぎの直し", {
          waitedBy: ["X-003", "X-004"],
          difficulty: "haiku",
          importance: "high",
          urgency: "high",
          followsDoneWork: true,
        }),
        taskCandidate("X-005", "架空の単独の直し", { difficulty: undefined, importance: "low" }),
      ],
      "haiku",
    )

    expect(prompt.split("\n")).toEqual([
      "## 候補",
      "- key: resume / 前回の続き（中身は渡さない）",
      "- key: X-002 / 印: 急ぎ・大事 / 待っているタスク: 2件 / 難しさ: 軽い / 前の作業: 済んでいる / 要約: 架空の急ぎの直し",
      "- key: X-005 / 印: なし / 待っているタスク: 0件 / 難しさ: 不明 / 前の作業: なし / 要約: 架空の単独の直し",
    ])
  })
})

describe("parseRecommendationResult", () => {
  it("候補のキーを札にして候補の順に並べ、前回の続きは中身を持たない札にする", () => {
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
      { kind: "resume", reason: "架空のつながりの理由" },
      { kind: "task", taskId: "X-002", reason: "架空の効き目の理由" },
    ])
  })

  it("候補に無いキー・重複・空や改行入りや長すぎる理由の件を1件ずつ落とす", () => {
    expect(
      parseRecommendationResult(
        {
          cards: [
            { key: "X-999", reason: "架空の理由" },
            { key: "X-002", reason: "" },
            { key: "X-002", reason: "架空の理由1" },
            { key: "X-002", reason: "架空の理由2" },
            { key: "X-005", reason: "架空の\n理由" },
            { key: "X-005", reason: "あ".repeat(41) },
            { key: "X-005", reason: "架空の理由3" },
            { key: "resume", reason: "架空の理由4" },
            { key: "X-007", reason: "架空の理由5" },
          ],
        },
        CANDIDATES,
      ),
    ).toEqual([
      { kind: "resume", reason: "架空の理由4" },
      { kind: "task", taskId: "X-002", reason: "架空の理由1" },
      { kind: "task", taskId: "X-005", reason: "架空の理由3" },
      { kind: "task", taskId: "X-007", reason: "架空の理由5" },
    ])
  })

  it("理由の字数はコードポイントで数える（サロゲートペア1文字を1字とする）", () => {
    expect(
      parseRecommendationResult(
        {
          cards: [
            { key: "X-002", reason: "😀".repeat(41) },
            { key: "X-005", reason: "😀".repeat(40) },
          ],
        },
        CANDIDATES,
      ),
    ).toEqual([{ kind: "task", taskId: "X-005", reason: "😀".repeat(40) }])
  })

  it("形が崩れている・1件も残らないときは何も返さない", () => {
    expect(parseRecommendationResult({ cards: "架空" }, CANDIDATES)).toBeUndefined()
    expect(
      parseRecommendationResult({ cards: [{ key: "X-999", reason: "架空" }] }, CANDIDATES),
    ).toBeUndefined()
  })
})
