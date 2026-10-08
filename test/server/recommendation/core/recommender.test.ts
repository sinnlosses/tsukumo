import { describe, expect, it } from "vitest"

import {
  recommendationCandidates,
  recommendationKey,
} from "../../../../src/server/recommendation/core/recommendation-candidate.ts"
import {
  createRecommender,
  type RecommendationCacheEntry,
} from "../../../../src/server/recommendation/core/recommender.ts"
import type { StructuredQuery } from "../../../../src/server/recommendation/core/structured-query.ts"
import type { RecommendationCard } from "../../../../src/shared/recommendation/recommendation-card.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../src/shared/repository/task-summary.ts"

// `query()` は差し替え、本物の claude は起こさない。タスク一覧はすべて架空。

function tasksOf(
  ...ids: readonly string[]
): Extract<TaskSummaryResult, { readonly kind: "known" }> {
  return {
    kind: "known",
    items: ids.map((id): TaskSummaryItem => ({
      id,
      summary: `架空の${id}`,
      status: "todo",
      dependencies: [],
      waitingFor: [],
      labels: [],
      body: "",
      location: { kind: "none" },
    })),
    runPrompt: "{id}",
  }
}

const OUTPUT = { cards: [{ key: "X-001", reason: "架空の理由" }] }
const CARDS: readonly RecommendationCard[] = [
  { kind: "task", taskId: "X-001", reason: "架空の理由" },
]

/** 呼ばれた問い合わせ・配った札・書いたキャッシュを覚える口。問い合わせの結果は外から解く。 */
function createHarness(initialCache: readonly RecommendationCacheEntry[] = []) {
  let cache = initialCache
  const emitted: (readonly RecommendationCard[])[] = []
  const failures: string[] = []
  const queries: {
    readonly request: StructuredQuery
    readonly signal: AbortSignal
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[] = []
  const recommender = createRecommender({
    readCache: () => cache,
    writeCache: (entries) => {
      cache = entries
    },
    query: (request, signal) =>
      new Promise((resolve, reject) => {
        queries.push({ request, signal, settle: resolve, fail: () => reject(new Error("架空")) })
      }),
    emit: (cards) => {
      emitted.push(cards)
    },
    onFailure: (place) => {
      failures.push(place)
    },
  })
  return { recommender, emitted, queries, failures, cache: () => cache }
}

/** 解いた問い合わせの続き（検査・書き込み・配る）が走り終わるのを待つ。 */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("createRecommender", () => {
  it("キャッシュに無ければ空を配ってから問い合わせ、結果をキャッシュの先頭へ書いて配る", async () => {
    const older = { key: "架空の古い印", cards: [] }
    const harness = createHarness([older])

    harness.recommender.observe(tasksOf("X-001"))
    harness.queries[0]?.settle(OUTPUT)
    await flush()

    expect(harness.emitted).toEqual([[], CARDS])
    expect(harness.cache()).toEqual([
      { key: recommendationKey(recommendationCandidates(tasksOf("X-001"))), cards: CARDS },
      older,
    ])
  })

  it("候補が同じなら問い合わせず、キャッシュに当たれば問い合わせずにその札を配る", () => {
    const key = recommendationKey(recommendationCandidates(tasksOf("X-001")))
    const harness = createHarness([{ key, cards: CARDS }])

    harness.recommender.observe(tasksOf("X-001"))
    harness.recommender.observe(tasksOf("X-001"))

    expect(harness.queries).toHaveLength(0)
    expect(harness.emitted).toEqual([CARDS])
  })

  it("失敗では空のほかに何も配らず、キャッシュも書かない", async () => {
    const harness = createHarness()

    harness.recommender.observe(tasksOf("X-001"))
    harness.queries[0]?.fail()
    await flush()

    expect(harness.emitted).toEqual([[]])
    expect(harness.cache()).toEqual([])
    expect(harness.failures).toEqual(["recommend-failed"])
  })

  it("中断されたあとの失敗は recommend-aborted として知らせる", async () => {
    const harness = createHarness()

    harness.recommender.observe(tasksOf("X-001"))
    harness.recommender.close()
    harness.queries[0]?.fail()
    await flush()

    expect(harness.emitted).toEqual([[]])
    expect(harness.failures).toEqual(["recommend-aborted"])
  })

  it("候補が変わったら走っている問い合わせを中断し、遅れて届いた古い結果は配らない", async () => {
    const harness = createHarness()

    harness.recommender.observe(tasksOf("X-001"))
    harness.recommender.observe(tasksOf("X-001", "X-002"))
    harness.queries[0]?.settle(OUTPUT)
    await flush()

    expect(harness.queries[0]?.signal.aborted).toBe(true)
    expect(harness.queries).toHaveLength(2)
    expect(harness.emitted).toEqual([[], []])
  })

  it("一覧が読めないときは何もしない", () => {
    const harness = createHarness()

    harness.recommender.observe({ kind: "unknown" })

    expect(harness.queries).toHaveLength(0)
    expect(harness.emitted).toEqual([])
  })

  it("タスク運用を使わないときも何もしない", () => {
    const harness = createHarness()

    harness.recommender.observe({ kind: "off" })

    expect(harness.queries).toHaveLength(0)
    expect(harness.emitted).toEqual([])
  })
})
