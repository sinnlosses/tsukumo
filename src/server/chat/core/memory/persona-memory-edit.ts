// `persona.md` の末尾の `## 覚えたこと` の節の編集と、書く・消すを断る理由の判定。
// 文字列と読み込み済みの行だけを受け、ファイルは触らない。
// 節より前は1バイトも触らない。

import {
  REMEMBERED_SECTION_HEADING,
  rememberedSectionStart,
} from "../../../../shared/character-pack/persona-section.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../../../shared/chat/persona-memory.ts"
import type { PersonaForgetResult, PersonaRememberResult } from "./chat-memory.ts"

/** 節が持てる行数（超えたらいちばん古い行を落とす）。 */
const MAX_REMEMBERED_LINES = 20

/** 書き足しを断る理由を、`remember` の判定の順に決める（断らないなら undefined）。`line` は前後の空白を落とした文面。 */
export function rememberRejection(input: {
  readonly turnUsed: boolean
  readonly line: string
  readonly editable: boolean
  readonly remembered: readonly string[]
}):
  | Extract<PersonaRememberResult, "turn-used" | "unwritable-line" | "not-editable" | "duplicate">
  | undefined {
  if (input.turnUsed) {
    return "turn-used"
  }
  if (!isWritableLine(input.line)) {
    return "unwritable-line"
  }
  if (!input.editable) {
    return "not-editable"
  }
  if (input.remembered.some((remembered) => remembered.trim() === input.line)) {
    return "duplicate"
  }
  return undefined
}

/** 消すのを断る理由を、`forget` の判定の順に決める（節を突き合わせる前に決まるものだけ。断らないなら undefined）。 */
export function forgetRejection(input: {
  readonly turnUsed: boolean
  readonly editable: boolean
  readonly target: string
}): Extract<PersonaForgetResult, "turn-used" | "not-editable" | "no-match"> | undefined {
  if (input.turnUsed) {
    return "turn-used"
  }
  if (!input.editable) {
    return "not-editable"
  }
  if (input.target === "") {
    return "no-match"
  }
  return undefined
}

/**
 * 節に1行足した `persona.md` の全文。
 * 節が無ければ見出しごと末尾に作り、あれば箇条書きを1行足して {@link MAX_REMEMBERED_LINES} までに詰める（溢れるのはいちばん古い行）。
 *
 * 節より前の文字は足しも引きもしない。節を作るときに足すのは、見出しの前の改行だけ。
 */
export function personaWithRememberedLine(content: string, line: string): string {
  const start = rememberedSectionStart(content)
  if (start === undefined) {
    return `${content}${headingSeparator(content)}${REMEMBERED_SECTION_HEADING}\n\n- ${line}\n`
  }

  const kept = [...rememberedLines(content.slice(start)), `- ${line}`].slice(-MAX_REMEMBERED_LINES)
  return `${content.slice(0, start)}${REMEMBERED_SECTION_HEADING}\n\n${kept.join("\n")}\n`
}

/**
 * 節から1行消した `persona.md` の全文（節が無い・一致する行が無いときは undefined）。
 * 同じ文面が2行あるときに消すのはいちばん古い1つだけ。
 *
 * 節より前の文字は足しも引きもしない。
 * 最後の1行を消したときは見出しごと落とす（空の節を `systemPrompt` に載せない）。
 */
export function personaWithoutRememberedLine(content: string, target: string): string | undefined {
  const start = rememberedSectionStart(content)
  if (start === undefined) {
    return undefined
  }

  const lines = rememberedLines(content.slice(start))
  const at = lines.findIndex((line) => line.slice(2).trim() === target)
  if (at < 0) {
    return undefined
  }

  const before = content.slice(0, start)
  const kept = lines.filter((_, index) => index !== at)
  return kept.length === 0
    ? before
    : `${before}${REMEMBERED_SECTION_HEADING}\n\n${kept.join("\n")}\n`
}

/**
 * いまの「覚えたこと」の一覧（`- ` を外した文面。新しい行が末尾）。節が無いときは空。
 */
export function rememberedTexts(content: string): readonly string[] {
  const start = rememberedSectionStart(content)
  return start === undefined
    ? []
    : rememberedLines(content.slice(start)).map((line) => line.slice(2))
}

/**
 * 消す行として突き合わせる文面。箇条書きの印（`- `）と前後の空白だけを落とす。
 * モデルは `systemPrompt` に載った節をそのまま写すので、印の付いた形でも来る。
 */
export function forgetTarget(line: string): string {
  return line
    .trim()
    .replace(/^-[ \t]+/, "")
    .trim()
}

/** 1行として受け取れる形か（空でない・改行を含まない・長さが上限以内）。 */
function isWritableLine(line: string): boolean {
  return line !== "" && !/[\n\r]/.test(line) && [...line].length <= MAX_REMEMBERED_LINE_LENGTH
}

/** 節の中の箇条書きの行（見出しと空行、人が書いた地の文は持ち越さない）。 */
function rememberedLines(section: string): readonly string[] {
  return section
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("- "))
}

/** 節を新しく作るときに、見出しの前に入れる改行（元の末尾と合わせて空行1つになる形）。 */
function headingSeparator(content: string): string {
  if (content === "" || content.endsWith("\n\n")) {
    return ""
  }

  return content.endsWith("\n") ? "\n" : "\n\n"
}
