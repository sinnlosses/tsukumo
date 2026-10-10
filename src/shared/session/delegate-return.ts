// 委譲先の返却（`SubagentHandback` の報告）の1行目を読んだ形。書式の正典は `docs/architecture/workflow-contract.md`「委譲の返却」。
// 読むのは1行目だけで、2行目より後ろは読まない。会話の内容が通るのでログに出さない。

/**
 * 返却の1行目。
 * `plan` は `計画 0/N`（段に数えない）、`phase-done` は `段 n/N`、`stopped` は `止めた n/N`、`unreadable` は契約の形でない1行目。
 */
export type DelegateReturn =
  | { readonly kind: "plan"; readonly count: number; readonly summary: string }
  | {
      readonly kind: "phase-done"
      readonly phase: number
      readonly count: number
      readonly summary: string
    }
  | {
      readonly kind: "stopped"
      readonly phase: number
      readonly count: number
      readonly summary: string
    }
  | { readonly kind: "unreadable" }

const UNREADABLE = { kind: "unreadable" } as const satisfies DelegateReturn

const FIRST_LINE = /^(計画|段|止めた)\s*(\d+)\s*\/\s*(\d+)\s*\|\s*(.*)$/u

/** 仕掛けが返却に足す注記の行の頭。 */
const HARNESS_NOTE_PREFIX = "[harness:"

/**
 * 返却の本文から1行目を決める。
 * 空の行と仕掛けの注記の行を除き、字下げを外した最初の行。
 */
export function firstHandbackLine(text: string): string | undefined {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith(HARNESS_NOTE_PREFIX))
}

/** 返却の本文を読む。1行目が契約の形でなければ `unreadable`。 */
export function parseDelegateReturn(text: string): DelegateReturn {
  const line = firstHandbackLine(text)
  return line === undefined ? UNREADABLE : parseHandbackLine(line)
}

/** 1行を読む。 */
export function parseHandbackLine(line: string): DelegateReturn {
  const match = FIRST_LINE.exec(line)
  if (match === null) {
    return UNREADABLE
  }
  const [, label, phaseText, countText, summary] = match
  const phase = Number(phaseText)
  const count = Number(countText)
  if (summary === undefined || !Number.isSafeInteger(phase) || !Number.isSafeInteger(count)) {
    return UNREADABLE
  }
  if (label === "計画") {
    return phase === 0 && count >= 1 ? { kind: "plan", count, summary: summary.trim() } : UNREADABLE
  }
  if (phase < 1 || phase > count) {
    return UNREADABLE
  }
  return label === "段"
    ? { kind: "phase-done", phase, count, summary: summary.trim() }
    : { kind: "stopped", phase, count, summary: summary.trim() }
}
