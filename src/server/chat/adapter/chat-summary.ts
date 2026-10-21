// あらすじ（雑談と仕事で1つ）の写し。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/chat-summary/<パック名>.md` で、パックごとに1ファイル、`cwd` には依存させない。
// 書き出してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。
//
// 何を載せるかの判断はここが決めない。ここが持つのは写しと印の読み書きだけ。
//
// 中身は1行目が印、2行目から要約の本文。
// 印は「次に起こすセッションへ渡す必要があるか」の1ビットで、`DELIVERED_MARK` の1行だけを「渡し済み」と読む。
// それ以外（別の文字列・無い・読めない）はすべて「未渡し」として扱い、倒れる方向を「同じ要約が2度載る」側にする。
//
// 最近の話題の見出しは、本文と別の `<パック名>.topics.json`（文字列の配列）に持つ。
// このファイルが無い・読めない写しは、本文の中に `<topics>` の組を埋め込んでいた形として読む（読みだけ。書くときは埋め込まない）。
//
// 書けなくても例外を投げない（`write` は書けたかどうかを返す）。

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import { readOptionalFile } from "../../adapter/lib/optional-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ChatSummary, ChatSummaryRecord } from "../../session-driver/core/session-driver.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-summary/`）。 */
const CHAT_SUMMARY_DIR_NAME = "chat-summary"

/** ファイルの1行目に書く印の文字列。この1行だけが「渡し済み」で、それ以外は「未渡し」。 */
const DELIVERED_MARK = "delivered"
const UNDELIVERED_MARK = "undelivered"

/**
 * 1ファイルの上限。印の行を含めて数える。
 * 写しと印は同じ書き込みで揃う1つのファイルなので、上限も分けない。
 */
export const CHAT_SUMMARY_LIMIT_BYTES = CHAT_MEMORY_BUDGET.synopsisBytes

/** 置き場を組めないパック（名前が {@link CharacterPackName} にならない）に渡す、読み書きとも何もしない口。 */
export const UNAVAILABLE_CHAT_SUMMARY: ChatSummary = {
  read: () => undefined,
  readTopics: () => [],
  write: () => ({ kind: "failed" }),
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
  const path = join(root, `${packName}.md`)
  const topicsPath = join(root, `${packName}.topics.json`)
  return {
    read: () => readRecord(path, topicsPath),
    readTopics: () => readTopics(path, topicsPath),
    write: (summary, topics) => {
      const truncated = truncatedSummary(summary)
      const written =
        writeRecord(path, {
          summary: truncated.text,
          delivered: readRaw(path)?.delivered ?? false,
        }) && writeTopics(topicsPath, topics)
      return written
        ? { kind: "written", droppedLines: truncated.droppedLines }
        : { kind: "failed" }
    },
    markUndelivered: () => {
      rewriteMark(path, false)
    },
    markDelivered: () => {
      rewriteMark(path, true)
    },
  }
}

/**
 * パック1つぶんの写しを消す。同じ名前で作り直したパックが、消したパックの要約を黙って拾わないため。
 * 無い・消せないときも何もせず続ける。
 */
export function discardChatSummary(
  packName: CharacterPackName,
  root: string = chatSummaryDir(),
): void {
  for (const name of [`${packName}.md`, `${packName}.topics.json`]) {
    try {
      rmSync(join(root, name), { force: true })
    } catch {
      // 消せないだけ。パックはもう一覧に無いので、写しは次に同じ名前で作るまで読まれない。
    }
  }
}

/** 置き場の親（`~/.tsukumo/chat-summary`）。書き込んでよいのはこの下だけ。 */
function chatSummaryDir(): string {
  return join(tsukumoHomeDir(), CHAT_SUMMARY_DIR_NAME)
}

/** 呼び出し側へ返す写し。話題を別のファイルに持たない古い形は、本文から話題の組を除いて返す。 */
function readRecord(path: string, topicsPath: string): ChatSummaryRecord | undefined {
  const raw = readRaw(path)
  if (raw === undefined || readStoredTopics(topicsPath) !== undefined) {
    return raw
  }
  return { summary: withoutEmbeddedTopics(raw.summary), delivered: raw.delivered }
}

function readTopics(path: string, topicsPath: string): readonly string[] {
  const stored = readStoredTopics(topicsPath)
  if (stored !== undefined) {
    return stored
  }
  return embeddedTopics(readRaw(path)?.summary ?? "")
}

/** 話題のファイルを読む。無い・JSON でない・文字列の配列でないときは undefined（古い形の写しとして読ませる）。 */
function readStoredTopics(topicsPath: string): readonly string[] | undefined {
  const content = readOptionalFile(topicsPath)
  if (content === undefined) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(content)
    return Array.isArray(parsed) && parsed.every((topic) => typeof topic === "string")
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

/** 話題の見出しを1回の書き込みで置き換える。書けたら true。失敗しても例外を投げない。 */
function writeTopics(topicsPath: string, topics: readonly string[]): boolean {
  try {
    mkdirSync(dirname(topicsPath), { recursive: true })
    writeFileSync(topicsPath, JSON.stringify(topics))
    return true
  } catch {
    return false
  }
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

/** 印だけを書き換える。ファイルの本文は既にある写しのまま保つ（無ければ空のまま）。 */
function rewriteMark(path: string, delivered: boolean): boolean {
  return writeRecord(path, { summary: readRaw(path)?.summary ?? "", delivered })
}

/** ファイルの1行目の印と、2行目からの中身をそのまま読む。ファイルが無い・読めないときは undefined。 */
function readRaw(path: string): ChatSummaryRecord | undefined {
  const content = readOptionalFile(path)
  if (content === undefined) {
    return undefined
  }

  const newline = content.indexOf("\n")
  const mark = newline === -1 ? content : content.slice(0, newline)
  const summary = newline === -1 ? "" : content.slice(newline + 1)
  return { summary, delivered: mark === DELIVERED_MARK }
}

/** 写しと印を1回の書き込みで揃える（上書き）。書けたら true。失敗しても例外を投げない。 */
function writeRecord(path: string, record: ChatSummaryRecord): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const mark = record.delivered ? DELIVERED_MARK : UNDELIVERED_MARK
    writeFileSync(path, `${mark}\n${record.summary}`)
    return true
  } catch {
    return false
  }
}

/**
 * {@link CHAT_SUMMARY_LIMIT_BYTES}（印の行を含む）に収まるよう、要約の本文を行単位で切り詰める。
 * 古いほうの行から落とし、行の途中では切らない。
 *
 * 本文の行は「新しい→古い」の順に積み、収まらなくなったところで古い行を落とす。
 * 要約の文面は「前の要約 + 新しい会話」を毎回まとめ直したものなので、末尾に近いほうが新しい話題という前提。
 *
 * 1行だけで印を除いた残りの上限を超えるとき（改行が無い）は、その1行をそのまま残す。
 * 空にする（＝要約ごと消える）よりも、上限を少し超えるほうを選ぶ。
 */
function truncatedSummary(summary: string): {
  readonly text: string
  readonly droppedLines: number
} {
  // 印の行の分（マークの長さ + 改行1つ）を引いた残りが本文の予算。
  // 渡し済み・未渡しのどちらで書かれるかは呼び出し側が決めるので、長いほう（`UNDELIVERED_MARK`）で見積もっておけば、あとで印だけ書き換えても超えない。
  const markBudget = byteLength(UNDELIVERED_MARK) + 1
  const budget = CHAT_SUMMARY_LIMIT_BYTES - markBudget
  const lines = summary.split("\n")
  if (budget <= 0) {
    return { text: "", droppedLines: lines.length }
  }

  const kept: string[] = []
  let usedBytes = 0
  for (const line of [...lines].reverse()) {
    const separatorBytes = kept.length > 0 ? 1 : 0
    const lineBytes = byteLength(line) + separatorBytes
    if (kept.length > 0 && usedBytes + lineBytes > budget) {
      break
    }
    kept.unshift(line)
    usedBytes += lineBytes
  }

  return { text: kept.join("\n"), droppedLines: lines.length - kept.length }
}
