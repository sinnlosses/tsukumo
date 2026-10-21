// エピソード索引（`~/.tsukumo/chat-archive/<パック名>/episode.jsonl`）の読み書き。
// 索引を書くのは定着で、ここが持つのは置き場と行の形、読める行の取り出しと追記だけ。
// 読めない行・知らない版は飛ばし、書けなくても例外を投げない（追記は書けたかどうかを返す）。

import { join } from "node:path"

import { z } from "zod"

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { appendJsonLines, readJsonLines } from "../../adapter/lib/jsonl.ts"
import type { ChatEpisodeAppendResult, ChatEpisodeDraft } from "../core/chat-archive-port.ts"
import { episodeIdCounters } from "../core/chat-episode-id.ts"

/**
 * `episode.jsonl` の1行の形。
 * zod の推論のままだと書くとき（{@link ChatEpisodeDraft.cues}）と読むときで `cues` の可変・不変が食い違うので、手で定義する。
 */
export type EpisodeLine = {
  readonly v: typeof EPISODE_FORMAT_VERSION
  readonly id: string
  readonly from: string
  readonly to: string
  readonly title: string
  readonly gist: string
  readonly cues: readonly string[]
  readonly weight: 1 | 2 | 3
}

/** エピソード索引を読み、読める行だけを書いた順のまま返す（読めない行・知らない版は飛ばす）。 */
export function readEpisodes(root: string, packName: CharacterPackName): readonly EpisodeLine[] {
  return readJsonLines(episodeIndexPath(root, packName)).flatMap((raw) => {
    const record = episodeLineSchema.safeParse(raw)
    return record.success ? [record.data] : []
  })
}

/**
 * 定着ができたエピソードを1回の書き込みで追記する（`ChatArchive.appendEpisodes` の実装）。
 * `id` は `to` のローカル日付＋その日の通し番号（`-1` から）で振る。
 */
export function appendEpisodes(
  root: string,
  packName: CharacterPackName,
  episodes: readonly ChatEpisodeDraft[],
): ChatEpisodeAppendResult {
  const counters = episodeIdCounters(readEpisodes(root, packName))
  const lines = episodes.map((draft): EpisodeLine => {
    const dateKey = draft.to.slice(0, 10)
    const next = (counters.get(dateKey) ?? 0) + 1
    counters.set(dateKey, next)
    return {
      v: EPISODE_FORMAT_VERSION,
      id: `${dateKey}-${String(next)}`,
      from: draft.from,
      to: draft.to,
      title: draft.title,
      gist: draft.gist,
      cues: draft.cues,
      weight: draft.weight,
    }
  })
  return appendJsonLines(episodeIndexPath(root, packName), lines)
    ? { kind: "written" }
    : { kind: "failed" }
}

/**
 * エピソード索引の名前。
 * 日付のファイル名を拾う `dateFileNames` の `YYYY-MM-DD.jsonl` の形を通らないので、窓の走査には混ざらない。
 */
const EPISODE_INDEX_FILE_NAME = "episode.jsonl"

/** エピソード索引の行の形の版（`episode.jsonl` 自身の版で、アーカイブの行の `v` とは別の数え方）。 */
const EPISODE_FORMAT_VERSION = 2 satisfies number

/** エピソード索引の1行。読めない行・知らない版は飛ばす。 */
const episodeLineSchema = z.object({
  v: z.literal(EPISODE_FORMAT_VERSION),
  id: z.string(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  title: z.string(),
  gist: z.string(),
  cues: z.array(z.string()),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

/** `~/.tsukumo/chat-archive/<パック名>/episode.jsonl` のパス。 */
function episodeIndexPath(root: string, packName: CharacterPackName): string {
  return join(root, packName, EPISODE_INDEX_FILE_NAME)
}
