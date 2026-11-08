// 補足メッセージを claude へ送る文面の包みと、transcript から包みを読み戻す決まり。
// 包みは claude が補足メッセージと分かる印で、入力の控え（`InputLedger`）の無い入力を組み直し（`toRestoredEvents`）が補足メッセージと見分ける手がかりでもある。

import type { ReplyTarget } from "../../../shared/session/reply-target.ts"

type ReplyTargetLabel = ReplyTarget["label"]

const ASIDE_OPEN = "<tsukumo-aside>"
const ASIDE_CLOSE = "</tsukumo-aside>"

const ASIDE_NOTE =
  "tsukumo の差し込み。利用者が送った補足メッセージで、作業の依頼ではない。作業は始めず `speak` を 1 回で答え、`report` は呼ばない"

/** 説明が「委譲中」に限っていた頃の1行。古い transcript の包みを読み戻すために残す。 */
const LEGACY_ASIDE_NOTE =
  "tsukumo の差し込み。委譲中に利用者が送った補足メッセージ。`speak` を 1 回で答え、`report` は呼ばない"

const TARGET_PREFIX = "指した所: "
const TARGET_SEPARATOR = " › "

/** 包みの全体。前後の空白だけを許し、包みの外に字があれば補足メッセージとして読まない。 */
const ASIDE_PROMPT = /^<tsukumo-aside>\n?([\s\S]*?)\n?<\/tsukumo-aside>$/

/** 包みから読み戻したもの。`targetParts` は指した所の行を ` › ` で割った並び（無ければ省く）。 */
export type AsideReading = {
  readonly text: string
  readonly targetParts?: readonly string[]
}

export function asidePromptText(text: string, label?: ReplyTargetLabel): string {
  const targetLine =
    label === undefined
      ? []
      : [
          `${TARGET_PREFIX}${[label.section, label.component, label.row]
            .filter((part) => part !== undefined)
            .join(TARGET_SEPARATOR)}`,
        ]
  return [ASIDE_OPEN, ASIDE_NOTE, ...targetLine, text, ASIDE_CLOSE].join("\n")
}

/**
 * 包みの説明（今のものも古いものも）と指した所の行を本文から分けて読む。
 * 説明の無い古い transcript は、包みの中身をそのまま本文として読む。
 */
export function asideReadingOf(raw: string): AsideReading | undefined {
  const inner = ASIDE_PROMPT.exec(raw.trim())?.[1]
  if (inner === undefined) {
    return undefined
  }
  const afterNote = [ASIDE_NOTE, LEGACY_ASIDE_NOTE]
    .map((note) => (inner.startsWith(`${note}\n`) ? inner.slice(note.length + 1) : undefined))
    .find((rest) => rest !== undefined)
  if (afterNote === undefined) {
    return { text: inner }
  }
  if (afterNote.startsWith(TARGET_PREFIX)) {
    const lineEnd = afterNote.indexOf("\n")
    const line = lineEnd === -1 ? afterNote : afterNote.slice(0, lineEnd)
    const text = lineEnd === -1 ? "" : afterNote.slice(lineEnd + 1)
    return { text, targetParts: line.slice(TARGET_PREFIX.length).split(TARGET_SEPARATOR) }
  }
  return { text: afterNote }
}
