// 推薦役。タスク一覧が届くたびに候補を作り直し、候補の並びが変わったときだけ札を作り直して配る。
// キャッシュに同じ候補があればそれを配り、無ければ背景で問い合わせる。誰もこの問い合わせを待たない。

import type { RecommendationCard } from "../../../shared/recommendation/recommendation-card.ts"
import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import {
  type RecommendationCandidate,
  recommendationCandidates,
  recommendationKey,
} from "./recommendation-candidate.ts"
import {
  parseRecommendationResult,
  RECOMMENDATION_TIMEOUT_MS,
  recommendationQuery,
} from "./recommendation.ts"
import type { StructuredQuery } from "./structured-query.ts"

/** キャッシュに持つ組の上限（新しい順）。 */
export const RECOMMENDATION_CACHE_LIMIT = 8

/** キャッシュの1組。`key` は {@link recommendationKey} の印。 */
export type RecommendationCacheEntry = {
  readonly key: string
  readonly cards: readonly RecommendationCard[]
}

export type RecommenderPorts = {
  /** キャッシュの組を新しい順に読む（無い・読めないときは空）。 */
  readonly readCache: () => readonly RecommendationCacheEntry[]
  /** キャッシュを丸ごと書く。失敗しても例外を投げない。 */
  readonly writeCache: (entries: readonly RecommendationCacheEntry[]) => void
  /** 問い合わせを1回走らせ、`structured_output` をそのまま返す。失敗・中断では reject する。 */
  readonly query: (request: StructuredQuery, signal: AbortSignal) => Promise<unknown>
  /** 札の並びを配る（空は「まだ無い」）。 */
  readonly emit: (cards: readonly RecommendationCard[]) => void
  /**
   * 問い合わせが失敗したことの知らせ口（中断・時間切れは `recommend-aborted`）。
   * `error` からは `error.name` と code だけを写すこと。
   */
  readonly onFailure: (place: "recommend-aborted" | "recommend-failed", error: unknown) => void
}

export type Recommender = {
  /** タスク一覧が届いたことを知らせる。`unknown` は何もしない（前の札を残す）。 */
  readonly observe: (tasks: TaskSummaryResult) => void
  /** 走っている問い合わせを中断し、以後は何も配らない。 */
  readonly close: () => void
}

/**
 * 候補の並びが前回と違うときだけ動く。
 * キャッシュに当たればその札を配って終わる。
 * 外れたら空の並びを配って古い候補の札を下ろし、走っている問い合わせを中断して新しい候補で1本起こす。
 * 結果が検査を通り、その間に中断・時間切れになっていなければ、キャッシュの先頭へ書いてから配る。
 * 失敗・時間切れ・中断では何も配らない。
 */
export function createRecommender(ports: RecommenderPorts): Recommender {
  let observedKey: string | undefined = undefined
  let running: AbortController | undefined = undefined
  let closed = false
  return {
    observe: (tasks) => {
      if (closed || tasks.kind === "unknown" || tasks.kind === "off") {
        return
      }
      const candidates = recommendationCandidates(tasks)
      const key = recommendationKey(candidates)
      if (key === observedKey) {
        return
      }
      observedKey = key
      running?.abort()
      running = undefined

      const cached = ports.readCache().find((entry) => entry.key === key)
      if (cached !== undefined) {
        ports.emit(cached.cards)
        return
      }
      ports.emit([])
      const controller = new AbortController()
      running = controller
      void recommend(ports, candidates, key, controller.signal)
    },
    close: () => {
      closed = true
      running?.abort()
    },
  }
}

async function recommend(
  ports: RecommenderPorts,
  candidates: readonly RecommendationCandidate[],
  key: string,
  signal: AbortSignal,
): Promise<void> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(RECOMMENDATION_TIMEOUT_MS)])
  try {
    const cards = parseRecommendationResult(
      await ports.query(recommendationQuery(candidates), bounded),
      candidates,
    )
    if (cards === undefined || bounded.aborted) {
      return
    }
    const others = ports.readCache().filter((entry) => entry.key !== key)
    ports.writeCache([{ key, cards }, ...others].slice(0, RECOMMENDATION_CACHE_LIMIT))
    ports.emit(cards)
  } catch (error) {
    ports.onFailure(bounded.aborted ? "recommend-aborted" : "recommend-failed", error)
  }
}
