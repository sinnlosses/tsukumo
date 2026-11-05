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
// 書けなくても例外を投げない（書く口は書けたかどうかを返す）。

import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { readJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type { ChatSummary, ChatSummaryFold, ChatSummaryRecord } from "../../core/chat-memory.ts"
import { truncatedSummary } from "../core/consolidation/chat-summary-truncation.ts"
import { CHAT_MEMORY_BUDGET } from "../core/memory/chat-memory-budget.ts"

const SUMMARY_FILE_SUFFIX = ".summary.json"

const SUMMARY_FORMAT_VERSION = 1 satisfies number

/** あらすじの本文の上限（UTF-8 バイト数）。 */
const CHAT_SUMMARY_LIMIT_BYTES = CHAT_MEMORY_BUDGET.synopsisBytes

/** 置き場を組めないパック（名前が {@link CharacterPackName} にならない）に渡す、読み書きとも何もしない口。 */
export const UNAVAILABLE_CHAT_SUMMARY: ChatSummary = {
  read: () => undefined,
  readTopics: () => [],
  readFold: () => ({ kind: "unknown" }),
  write: () => ({ kind: "failed" }),
  markUndelivered: () => {},
  markDelivered: () => {},
}

/**
 * パック1つぶんの写しの読み書きの関数を作る。
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
      const truncated = truncatedSummary(summary, CHAT_SUMMARY_LIMIT_BYTES)
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
    markUndelivered: () => {
      store(paths, { ...(readStored(paths) ?? EMPTY_STORED), delivered: false })
    },
    markDelivered: () => {
      store(paths, { ...(readStored(paths) ?? EMPTY_STORED), delivered: true })
    },
  }
}

/**
 * パック1つぶんの写しを消す（写しと、書きかけで残った一時ファイル）。
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
  for (const path of [paths.current, ...temps.map((name) => join(root, name))]) {
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
}

function summaryPaths(root: string, packName: CharacterPackName): SummaryPaths {
  return {
    root,
    current: join(root, `${packName}${SUMMARY_FILE_SUFFIX}`),
  }
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
]) satisfies z.ZodType<ChatSummaryFold>

const storedSchema = z.object({
  v: z.literal(SUMMARY_FORMAT_VERSION),
  delivered: z.boolean(),
  synopsis: z.string(),
  topics: z.array(z.string()).readonly(),
  fold: foldSchema,
})

type StoredSummary = Omit<z.infer<typeof storedSchema>, "v">

function recordOf(stored: StoredSummary | undefined): ChatSummaryRecord | undefined {
  return stored === undefined
    ? undefined
    : { summary: stored.synopsis, delivered: stored.delivered }
}

function readStored(paths: SummaryPaths): StoredSummary | undefined {
  const parsed = storedSchema.safeParse(readJsonFile(paths.current))
  if (!parsed.success) {
    return undefined
  }
  const { delivered, synopsis, topics, fold } = parsed.data
  return { delivered, synopsis, topics, fold }
}

function store(paths: SummaryPaths, stored: StoredSummary): boolean {
  try {
    mkdirSync(paths.root, { recursive: true })
    writeFileAtomic(paths.current, JSON.stringify({ v: SUMMARY_FORMAT_VERSION, ...stored }))
  } catch {
    // 書けなかったことは戻り値の false で呼び出し側へ返す
    return false
  }
  return true
}

/** ディレクトリの中の名前（読めなければ空）。 */
function entryNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    // 読めないディレクトリは空として扱う
    return []
  }
}
