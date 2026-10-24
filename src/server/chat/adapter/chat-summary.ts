// あらすじ（雑談と仕事で1つ）の写し。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/chat-summary/<パック名>.summary.json` で、パックごとに1ファイル、`cwd` には依存させない。
// 書き出してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。
//
// 何を載せるかの判断はここが決めない。ここが持つのは写しと印の読み書きだけ。
//
// 1つの JSON に、あらすじの本文・最近の話題の見出し・渡し済みの印・あらすじが取り込んだところ（`fold`）を持ち、
// 一時ファイルからの rename で丸ごと置き換える（書きかけの状態を読ませない）。
// 読めない JSON は無いものとして扱い、倒れる方向を「同じ要約が2度載る」側にする（印は「未渡し」）。
//
// 旧い形（`<パック名>.md` の1行目が印・2行目から本文、話題は `<パック名>.topics.json`、さらに古い写しは本文の `<topics>` の組）は、
// 新しい形が無い・読めないときだけ読む。新しい形を書けたら旧いファイルを消す（消せなくても新しい形が正）。
//
// 書けなくても例外を投げない（書く口は書けたかどうかを返す）。

import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { readJsonFile } from "../../adapter/lib/json-file.ts"
import { readOptionalFile } from "../../adapter/lib/optional-file.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type {
  ChatSummary,
  ChatSummaryFold,
  ChatSummaryRecord,
} from "../../session-driver/core/session-driver.ts"

/**
 * 新しい形のファイル名の後ろ。
 * パック名はドットを含めるので、`<パック名>.json` だと別のパックの旧い `<パック名>.topics.json` と重なりうる。
 */
const SUMMARY_FILE_SUFFIX = ".summary.json"

/** 旧い形の1行目の印。この1行だけが「渡し済み」で、それ以外は「未渡し」。 */
const LEGACY_DELIVERED_MARK = "delivered"

const SUMMARY_FORMAT_VERSION = 1 satisfies number

/** あらすじの本文の上限（UTF-8 バイト数）。 */
const CHAT_SUMMARY_LIMIT_BYTES = CHAT_MEMORY_BUDGET.synopsisBytes

/** 置き場を組めないパック（名前が {@link CharacterPackName} にならない）に渡す、読み書きとも何もしない口。 */
export const UNAVAILABLE_CHAT_SUMMARY: ChatSummary = {
  read: () => undefined,
  readTopics: () => [],
  readFold: () => ({ kind: "unknown" }),
  write: () => ({ kind: "failed" }),
  writeFold: () => ({ kind: "failed" }),
  markUndelivered: () => {},
  markDelivered: () => {},
}

/**
 * パック1つぶんの写しの読み書き口を作る。
 *
 * `root` は書き込み先の親（既定は {@link chatSummaryDir}）。
 */
export function createChatSummary(
  packName: CharacterPackName,
  root: string = chatSummaryDir(),
): ChatSummary {
  const paths = summaryPaths(root, packName)
  return {
    read: () => recordOf(readStored(paths)),
    readTopics: () => readStored(paths)?.topics ?? [],
    readFold: () => readStored(paths)?.fold ?? UNKNOWN_FOLD,
    write: (summary, topics, foldedThrough) => {
      const truncated = truncatedSummary(summary)
      const written = store(paths, {
        delivered: readStored(paths)?.delivered ?? false,
        synopsis: truncated.text,
        topics,
        fold: { kind: "through", at: foldedThrough },
      })
      return written
        ? { kind: "written", droppedLines: truncated.droppedLines }
        : { kind: "failed" }
    },
    writeFold: (fold) => {
      const current = readStored(paths) ?? EMPTY_STORED
      return store(paths, { ...current, fold }) ? { kind: "written" } : { kind: "failed" }
    },
    markUndelivered: () => {
      store(paths, { ...(readStored(paths) ?? EMPTY_STORED), delivered: false })
    },
    markDelivered: () => {
      store(paths, { ...(readStored(paths) ?? EMPTY_STORED), delivered: true })
    },
  }
}

/**
 * パック1つぶんの写しを消す（新しい形・旧い形・書きかけで残った一時ファイル）。
 * 同じ名前で作り直したパックが、消したパックの要約を黙って拾わないため。
 * 無い・消せないときも何もせず続ける。
 */
export function discardChatSummary(
  packName: CharacterPackName,
  root: string = chatSummaryDir(),
): void {
  const paths = summaryPaths(root, packName)
  const tempPrefix = `${packName}${SUMMARY_FILE_SUFFIX}.`
  const temps = entryNames(root).filter(
    (name) => name.startsWith(tempPrefix) && TEMP_SUFFIX.test(name.slice(tempPrefix.length)),
  )
  for (const path of [
    paths.current,
    paths.legacyBody,
    paths.legacyTopics,
    ...temps.map((name) => join(root, name)),
  ]) {
    try {
      rmSync(path, { force: true })
    } catch {
      // 消せないだけ。パックはもう一覧に無いので、写しは次に同じ名前で作るまで読まれない。
    }
  }
}

/** 置き場の親（`~/.tsukumo/chat-summary`）。書き込んでよいのはこの下だけ。 */
function chatSummaryDir(): string {
  return tsukumoHomePath("chatSummary")
}

/** `writeFileAtomic` の一時ファイルの名前の後ろ（16進12桁と `.tmp`）。 */
const TEMP_SUFFIX = /^[0-9a-f]{12}\.tmp$/

type SummaryPaths = {
  readonly root: string
  readonly current: string
  readonly legacyBody: string
  readonly legacyTopics: string
}

function summaryPaths(root: string, packName: CharacterPackName): SummaryPaths {
  return {
    root,
    current: join(root, `${packName}${SUMMARY_FILE_SUFFIX}`),
    legacyBody: join(root, `${packName}.md`),
    legacyTopics: join(root, `${packName}.topics.json`),
  }
}

type StoredSummary = {
  readonly delivered: boolean
  readonly synopsis: string
  readonly topics: readonly string[]
  readonly fold: ChatSummaryFold
}

const UNKNOWN_FOLD = { kind: "unknown" } as const satisfies ChatSummaryFold

/** 写しが無いところへ印だけを書くときの中身。 */
const EMPTY_STORED = {
  delivered: false,
  synopsis: "",
  topics: [],
  fold: UNKNOWN_FOLD,
} as const satisfies StoredSummary

const foldSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("through"), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T/) }),
])

const storedSchema = z.object({
  v: z.literal(SUMMARY_FORMAT_VERSION),
  delivered: z.boolean(),
  synopsis: z.string(),
  topics: z.array(z.string()),
  fold: foldSchema,
})

function recordOf(stored: StoredSummary | undefined): ChatSummaryRecord | undefined {
  return stored === undefined
    ? undefined
    : { summary: stored.synopsis, delivered: stored.delivered }
}

/** 新しい形を読み、無い・読めないときは旧い形を読む。どちらも無ければ undefined。 */
function readStored(paths: SummaryPaths): StoredSummary | undefined {
  const parsed = storedSchema.safeParse(readJsonFile(paths.current))
  if (parsed.success) {
    const { delivered, synopsis, topics, fold } = parsed.data
    return { delivered, synopsis, topics, fold }
  }
  return readLegacy(paths)
}

/**
 * 新しい形の JSON を丸ごと書き、書けたら旧いファイルを消す。書けたら true。失敗しても例外を投げない。
 */
function store(paths: SummaryPaths, stored: StoredSummary): boolean {
  try {
    mkdirSync(paths.root, { recursive: true })
    writeFileAtomic(paths.current, JSON.stringify({ v: SUMMARY_FORMAT_VERSION, ...stored }))
  } catch {
    return false
  }
  for (const legacy of [paths.legacyBody, paths.legacyTopics]) {
    try {
      rmSync(legacy, { force: true })
    } catch {
      // 新しい形が正なので、残っても読まれない。
    }
  }
  return true
}

/**
 * 旧い形を読む。本文のファイルが無い・読めないときは undefined。
 * 話題は `<パック名>.topics.json` を読み、無い・読めない・文字列の配列でないときは本文に埋め込んだ組から読んで、本文からは組を除く。
 */
function readLegacy(paths: SummaryPaths): StoredSummary | undefined {
  const content = readOptionalFile(paths.legacyBody)
  if (content === undefined) {
    return undefined
  }

  const newline = content.indexOf("\n")
  const mark = newline === -1 ? content : content.slice(0, newline)
  const body = newline === -1 ? "" : content.slice(newline + 1)
  const delivered = mark === LEGACY_DELIVERED_MARK
  const stored = readLegacyTopics(paths.legacyTopics)
  if (stored !== undefined) {
    return { delivered, synopsis: body, topics: stored, fold: UNKNOWN_FOLD }
  }
  return {
    delivered,
    synopsis: withoutEmbeddedTopics(body),
    topics: embeddedTopics(body),
    fold: UNKNOWN_FOLD,
  }
}

/** 旧い形の話題のファイルを読む。無い・JSON でない・文字列の配列でないときは undefined。 */
function readLegacyTopics(topicsPath: string): readonly string[] | undefined {
  const parsed = z.array(z.string()).safeParse(readJsonFile(topicsPath))
  return parsed.success ? parsed.data : undefined
}

/** 話題を本文に埋め込んでいた古い形の組（`<topics>` から次の `</topics>` まで）。 */
const EMBEDDED_TOPICS_BLOCK = /<topics>[\s\S]*?<\/topics>/gu

const EMBEDDED_TOPICS_OPEN = "<topics>"
const EMBEDDED_TOPICS_CLOSE = "</topics>"

/** 見出しの行の頭に付いた箇条の印（`- ` `* ` `・` `1. `）。 */
const LIST_MARKER = /^(?:[-*・•]|\d+[.)])\s*/u

/** 古い形の本文から話題の組をすべて除いた、あらすじの地の文。閉じの無い組は組と見なさず残す。 */
function withoutEmbeddedTopics(body: string): string {
  return body.replaceAll(EMBEDDED_TOPICS_BLOCK, "").trim()
}

/**
 * 古い形の本文から、最後の `<topics>` とその後ろの最初の `</topics>` の間の行を取り出す。
 * 閉じが無い・印が無いときは空。箇条の印を落とし、空行を飛ばすだけで、中身の良し悪しは判定しない。
 */
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

/** ディレクトリの中の名前（読めなければ空）。 */
function entryNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/**
 * {@link CHAT_SUMMARY_LIMIT_BYTES} に収まるよう、要約の本文を行単位で切り詰める。
 * 古いほうの行から落とし、行の途中では切らない。
 *
 * 本文の行は「新しい→古い」の順に積み、収まらなくなったところで古い行を落とす。
 * 要約の文面は「前の要約 + 新しい会話」を毎回まとめ直したものなので、末尾に近いほうが新しい話題という前提。
 *
 * 1行だけで上限を超えるとき（改行が無い）は、その1行をそのまま残す。
 * 空にする（＝要約ごと消える）よりも、上限を少し超えるほうを選ぶ。
 */
function truncatedSummary(summary: string): {
  readonly text: string
  readonly droppedLines: number
} {
  const lines = summary.split("\n")
  const kept: string[] = []
  let usedBytes = 0
  for (const line of lines.toReversed()) {
    const separatorBytes = kept.length > 0 ? 1 : 0
    const lineBytes = byteLength(line) + separatorBytes
    if (kept.length > 0 && usedBytes + lineBytes > CHAT_SUMMARY_LIMIT_BYTES) {
      break
    }
    kept.unshift(line)
    usedBytes += lineBytes
  }

  return { text: kept.join("\n"), droppedLines: lines.length - kept.length }
}
