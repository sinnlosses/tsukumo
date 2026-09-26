// エピソード索引の採点（純粋関数。`docs/design.md` 7章「エピソード索引はどこに置くか」の
// 採点の式）。ファイルには一切触らない——`episode.jsonl` と `recalled.jsonl` を読むのは
// `src/server/chat/adapter/chat-archive.ts` で、ここは渡された行を並べ替えるだけ（原則3）。
//
// 採点は4段（`docs/design.md` 7章の表）: 一致（手がかり語・見出し・要旨への当たり、日本語は
// 2文字ずつの重なりでも拾う）→ 足切り（一致が `minMatch` 未満は候補にしない）→ 新しさ
// （`to` から経った日数で減衰し、思い出した回数が多いほど緩む）→ 点（一致 × `weight` × 新しさ）。

import { CHAT_RECALL_SCORE, type ChatRecallScore } from "../../../shared/chat-memory-budget.ts"
import { type ChatEpisodeCandidate } from "../../session-driver/core/session-driver.ts"

/**
 * `episode.jsonl` の1行のうち、採点に要る部分だけ（版・`from` は読まない。読んで検証するのは
 * `chat-archive.ts`）。
 */
export type ChatEpisodeRecord = {
  readonly id: string
  readonly to: string
  readonly title: string
  readonly gist: string
  readonly cues: readonly string[]
  readonly weight: 1 | 2 | 3
}

/**
 * 引く言葉でエピソードを採点し、足切りを通ったものだけを点の高い順（同点は `to` の新しい順）に
 * 返す。`recallCounts` は `id` → `recall_episode` で開いた回数（無ければ0扱い）。
 *
 * 引く言葉が空白だけ・空のときは何も当たらない（空配列）。
 */
export function scoreChatEpisodes(
  episodes: readonly ChatEpisodeRecord[],
  keyword: string,
  now: Temporal.Instant,
  recallCounts: ReadonlyMap<string, number>,
  coefficients: ChatRecallScore = CHAT_RECALL_SCORE,
): readonly ChatEpisodeCandidate[] {
  const terms = tokenize(keyword)
  if (terms.length === 0) {
    return []
  }

  const scored = episodes
    .map((episode) => ({
      episode,
      match: matchOf(episode, terms, coefficients),
    }))
    .filter(({ match }) => match >= coefficients.minMatch)
    .map(({ episode, match }) => ({
      episode,
      total:
        match *
        episode.weight *
        recencyOf(episode.to, now, recallCounts.get(episode.id) ?? 0, coefficients),
    }))

  return scored
    .toSorted((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total
      }
      return Temporal.Instant.compare(
        Temporal.Instant.from(b.episode.to),
        Temporal.Instant.from(a.episode.to),
      )
    })
    .map(({ episode }) => ({ id: episode.id, title: episode.title, gist: episode.gist }))
}

/** そのエピソードの一致（語ごとの当たりの最大を足し合わせる）。 */
function matchOf(
  episode: ChatEpisodeRecord,
  terms: readonly string[],
  coefficients: ChatRecallScore,
): number {
  return terms.reduce((sum, term) => sum + termMatch(term, episode, coefficients), 0)
}

/** 1語への当たり（手がかり語・見出し・要旨それぞれに欄の重みを掛けた最大）。 */
function termMatch(
  term: string,
  episode: ChatEpisodeRecord,
  coefficients: ChatRecallScore,
): number {
  const cueScore = fieldMatch(term, episode.cues) * coefficients.cueWeight
  const titleScore = matchValue(term, episode.title) * coefficients.titleWeight
  const gistScore = matchValue(term, episode.gist) * coefficients.gistWeight
  return Math.max(cueScore, titleScore, gistScore)
}

/** 複数の手がかり語のうち、いちばん当たりの高いもの。 */
function fieldMatch(term: string, texts: readonly string[]): number {
  return texts.reduce((max, text) => Math.max(max, matchValue(term, text)), 0)
}

/**
 * 1語と1つの文面の当たり（含まれれば1、でなければ語の2文字ずつの組のうち文面に含まれる割合）。
 * 1文字の語は2文字の組が作れないので、含まれるかどうかだけで見る（`docs/chat-mode.md`
 * 4.9「古い雑談は索引を引いて思い出す」）。
 */
function matchValue(term: string, text: string): number {
  const field = text.toLowerCase()
  if (field.includes(term)) {
    return 1
  }
  const bigrams = bigramsOf(term)
  if (bigrams.length === 0) {
    return 0
  }
  const hit = bigrams.filter((bigram) => field.includes(bigram)).length
  return hit / bigrams.length
}

/** 語を2文字ずつ重ねて区切った組（`ab` `bc` …）。1文字以下の語は空。 */
function bigramsOf(term: string): readonly string[] {
  const chars = [...term]
  return chars.slice(0, -1).map((_, index) => chars.slice(index, index + 2).join(""))
}

/**
 * 新しさ（`to` から経った日数で減衰し、下限 `recencyFloor` を割らない。思い出した回数が
 * 多いほど半減期が伸びて下がり方が緩む）。
 */
function recencyOf(
  to: string,
  now: Temporal.Instant,
  recallCount: number,
  coefficients: ChatRecallScore,
): number {
  const days = (now.epochMilliseconds - Temporal.Instant.from(to).epochMilliseconds) / 86_400_000
  const halfLife =
    coefficients.halfLifeDays * (1 + coefficients.halfLifeGainPerRecall * recallCount)
  return Math.max(coefficients.recencyFloor, 0.5 ** (days / halfLife))
}

/** 引く言葉を空白で分け、小文字にした語の並び（空の語は落とす）。 */
function tokenize(keyword: string): readonly string[] {
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "")
}
