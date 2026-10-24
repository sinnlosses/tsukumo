// あらすじの旧い形（`<パック名>.md`＋`<パック名>.topics.json`、さらに古い `<topics>` の埋め込み）を
// 新しい形（`<パック名>.summary.json`）へ移し、取り残したファイルを消す。人が1回だけ打つ使い捨ての道具の本体。
//
// 新しい形の `fold` は、パックの `episode.jsonl` の最後の行の `to`（日時の文字列）から作る。
// 無い・読めないときは `unknown` のまま残し、アプリが最初から畳む。
// あらすじの本文・話題・エピソードの文面は、返す報告にも標準出力にも入れない（件数・長さ・日付だけ）。

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import { writeFileAtomic } from "../../src/server/adapter/lib/atomic-file.ts"
import { readJsonFile } from "../../src/server/adapter/lib/json-file.ts"
import { readOptionalFile } from "../../src/server/adapter/lib/optional-file.ts"
import { tsukumoHomePath } from "../../src/server/adapter/tsukumo-home.ts"
import type { ChatSummaryFold } from "../../src/server/chat/core/chat-memory.ts"
import { parseCharacterPackName } from "../../src/shared/character-pack/character.ts"
import type { CharacterPackName } from "../../src/shared/character-pack/character.ts"
import { parseJson } from "../../src/shared/utils/parse-json.ts"

const CURRENT_SUFFIX = ".summary.json"
const LEGACY_BODY_SUFFIX = ".md"
const LEGACY_TOPICS_SUFFIX = ".topics.json"
const EPISODE_FILE_NAME = "episode.jsonl"
const UNREAD_ARCHIVE_FILE_NAMES = ["kept.jsonl", "index.jsonl", "recalled.jsonl"] as const
const VISUAL_DIR_NAME = "visual"
const LEGACY_DELIVERED_MARK = "delivered"
const SUMMARY_FORMAT_VERSION = 1 satisfies number
const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T/

const currentSchema = z.object({
  v: z.literal(SUMMARY_FORMAT_VERSION),
  delivered: z.boolean(),
  synopsis: z.string(),
  topics: z.array(z.string()),
  fold: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unknown") }),
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("through"), at: z.string().regex(AT_PATTERN) }),
  ]),
})

const episodeLineSchema = z.object({ to: z.string().regex(AT_PATTERN) })

type StoredSummary = z.infer<typeof currentSchema>

export type MigrationPlace = {
  readonly summaryRoot: string
  readonly archiveRoot: string
}

export type PackMigration =
  | {
      readonly kind: "migrated" | "would-migrate"
      readonly pack: CharacterPackName
      readonly delivered: boolean
      readonly synopsisBytes: number
      readonly topicCount: number
      readonly fold: ChatSummaryFold
    }
  | {
      readonly kind: "skipped"
      readonly pack: CharacterPackName
      readonly reason: "current" | "no-body" | "none"
    }

export type PruneItem = {
  readonly name: string
  readonly path: string
  readonly bytes: number
  readonly outcome: "removed" | "would-remove" | "kept-no-current"
}

/** ホームの下の、移行が触る置き場。 */
export function migrationPlace(home: string): MigrationPlace {
  return {
    summaryRoot: tsukumoHomePath("chatSummary", home),
    archiveRoot: tsukumoHomePath("chatArchive", home),
  }
}

/** あらすじの置き場にあるパックを順に移す。`dryRun` なら何も書かず、書くはずだった内容の報告だけを返す。 */
export function migrateChatSummaries(
  place: MigrationPlace,
  dryRun: boolean,
): readonly PackMigration[] {
  return summaryPackNames(place.summaryRoot).map((pack) => migratePack(place, pack, dryRun))
}

/**
 * 取り残したファイルを消す（`dryRun` なら一覧だけ）。
 * `.md`・`.topics.json`・`episode.jsonl` は、そのパックの新しい形が読めるときだけ消す。
 */
export function pruneLeftovers(
  place: MigrationPlace,
  home: string,
  dryRun: boolean,
): readonly PruneItem[] {
  const items: PruneItem[] = []
  const add = (name: string, path: string, outcome: "remove" | "keep"): void => {
    if (!existsSync(path)) {
      return
    }
    const bytes = sizeOf(path)
    if (outcome === "keep") {
      items.push({ name, path, bytes, outcome: "kept-no-current" })
      return
    }
    if (!dryRun) {
      rmSync(path, { recursive: true, force: true })
    }
    items.push({ name, path, bytes, outcome: dryRun ? "would-remove" : "removed" })
  }

  add(VISUAL_DIR_NAME, join(home, VISUAL_DIR_NAME), "remove")
  const packs = [
    ...new Set([...summaryPackNames(place.summaryRoot), ...archivePackNames(place.archiveRoot)]),
  ].toSorted()
  for (const pack of packs) {
    const hasCurrent = readCurrent(place, pack) !== undefined
    const dir = join(place.archiveRoot, pack)
    for (const fileName of UNREAD_ARCHIVE_FILE_NAMES) {
      add(`${pack}/${fileName}`, join(dir, fileName), "remove")
    }
    add(
      `${pack}/${EPISODE_FILE_NAME}`,
      join(dir, EPISODE_FILE_NAME),
      hasCurrent ? "remove" : "keep",
    )
    if (hasCurrent) {
      for (const suffix of [LEGACY_BODY_SUFFIX, LEGACY_TOPICS_SUFFIX]) {
        add(`${pack}${suffix}`, join(place.summaryRoot, `${pack}${suffix}`), "remove")
      }
    }
  }
  return items
}

/** 移行の報告を1行ずつの文字列にする。本文・話題の文字列は入れない。 */
export function describeMigration(results: readonly PackMigration[]): readonly string[] {
  return results.map((result) => {
    if (result.kind === "skipped") {
      return `${result.pack}\tskipped: ${result.reason}`
    }
    return [
      result.pack,
      result.kind,
      `fold=${result.fold.kind === "through" ? result.fold.at.slice(0, 10) : result.fold.kind}`,
      `synopsis=${String(result.synopsisBytes)}B`,
      `topics=${String(result.topicCount)}`,
      result.delivered ? "delivered" : "undelivered",
    ].join("\t")
  })
}

/** 掃除の報告を1行ずつの文字列にする。 */
export function describePrune(items: readonly PruneItem[]): readonly string[] {
  return items.map((item) => `${item.name}\t${item.outcome}\t${String(item.bytes)}B`)
}

/** パック1つぶんを移す。新しい形が読めるときは何もしない。 */
function migratePack(
  place: MigrationPlace,
  pack: CharacterPackName,
  dryRun: boolean,
): PackMigration {
  if (readCurrent(place, pack) !== undefined) {
    return { kind: "skipped", pack, reason: "current" }
  }

  const body = readOptionalFile(join(place.summaryRoot, `${pack}${LEGACY_BODY_SUFFIX}`))
  if (body === undefined) {
    const hasTopics = existsSync(join(place.summaryRoot, `${pack}${LEGACY_TOPICS_SUFFIX}`))
    return { kind: "skipped", pack, reason: hasTopics ? "no-body" : "none" }
  }

  const stored = storedFromLegacy(place, pack, body)
  if (!dryRun) {
    mkdirSync(place.summaryRoot, { recursive: true })
    writeFileAtomic(join(place.summaryRoot, `${pack}${CURRENT_SUFFIX}`), JSON.stringify(stored))
  }
  return {
    kind: dryRun ? "would-migrate" : "migrated",
    pack,
    delivered: stored.delivered,
    synopsisBytes: Buffer.byteLength(stored.synopsis),
    topicCount: stored.topics.length,
    fold: stored.fold,
  }
}

function storedFromLegacy(
  place: MigrationPlace,
  pack: CharacterPackName,
  content: string,
): StoredSummary {
  const newline = content.indexOf("\n")
  const mark = newline === -1 ? content : content.slice(0, newline)
  const body = newline === -1 ? "" : content.slice(newline + 1)
  const delivered = mark === LEGACY_DELIVERED_MARK
  const fold = foldFromEpisode(place, pack)
  const topicsFile = z
    .array(z.string())
    .safeParse(readJsonFile(join(place.summaryRoot, `${pack}${LEGACY_TOPICS_SUFFIX}`)))
  if (topicsFile.success) {
    return { v: SUMMARY_FORMAT_VERSION, delivered, synopsis: body, topics: topicsFile.data, fold }
  }
  return {
    v: SUMMARY_FORMAT_VERSION,
    delivered,
    synopsis: withoutEmbeddedTopics(body),
    topics: [...embeddedTopics(body)],
    fold,
  }
}

/** `episode.jsonl` の最後の行の `to` だけを読む。無い・空・壊れているときは `unknown`。 */
function foldFromEpisode(place: MigrationPlace, pack: CharacterPackName): ChatSummaryFold {
  const content = readOptionalFile(join(place.archiveRoot, pack, EPISODE_FILE_NAME))
  const last = content?.split("\n").findLast((line) => line.trim() !== "")
  if (last === undefined) {
    return { kind: "unknown" }
  }
  const parsed = episodeLineSchema.safeParse(parseJson(last))
  return parsed.success ? { kind: "through", at: parsed.data.to } : { kind: "unknown" }
}

function readCurrent(place: MigrationPlace, pack: CharacterPackName): StoredSummary | undefined {
  const parsed = currentSchema.safeParse(
    readJsonFile(join(place.summaryRoot, `${pack}${CURRENT_SUFFIX}`)),
  )
  return parsed.success ? parsed.data : undefined
}

/** あらすじの置き場のファイル名から、パック名を重複なしで並べる。 */
function summaryPackNames(summaryRoot: string): readonly CharacterPackName[] {
  const names = entryNames(summaryRoot).flatMap((fileName) => {
    const suffix = [CURRENT_SUFFIX, LEGACY_TOPICS_SUFFIX, LEGACY_BODY_SUFFIX].find((candidate) =>
      fileName.endsWith(candidate),
    )
    const pack =
      suffix === undefined ? undefined : parseCharacterPackName(fileName.slice(0, -suffix.length))
    return pack === undefined ? [] : [pack]
  })
  return [...new Set(names)].toSorted()
}

function archivePackNames(archiveRoot: string): readonly CharacterPackName[] {
  return entryNames(archiveRoot).flatMap((name) => {
    const pack = parseCharacterPackName(name)
    return pack === undefined ? [] : [pack]
  })
}

function entryNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** ファイルの大きさ。ディレクトリは中を足す。 */
function sizeOf(path: string): number {
  try {
    const stat = statSync(path)
    if (!stat.isDirectory()) {
      return stat.size
    }
    return entryNames(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
  } catch {
    return 0
  }
}

const EMBEDDED_TOPICS_BLOCK = /<topics>[\s\S]*?<\/topics>/gu
const EMBEDDED_TOPICS_OPEN = "<topics>"
const EMBEDDED_TOPICS_CLOSE = "</topics>"
const LIST_MARKER = /^(?:[-*・•]|\d+[.)])\s*/u

function withoutEmbeddedTopics(body: string): string {
  return body.replaceAll(EMBEDDED_TOPICS_BLOCK, "").trim()
}

/** 最後の `<topics>` とその後ろの最初の `</topics>` の間の行。閉じが無い・印が無いときは空。 */
function embeddedTopics(body: string): readonly string[] {
  const open = body.lastIndexOf(EMBEDDED_TOPICS_OPEN)
  if (open === -1) {
    return []
  }
  const start = open + EMBEDDED_TOPICS_OPEN.length
  const close = body.indexOf(EMBEDDED_TOPICS_CLOSE, start)
  if (close === -1) {
    return []
  }
  return body
    .slice(start, close)
    .split("\n")
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter((topic) => topic !== "")
}
