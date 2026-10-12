// 迎えの挨拶と反応の行を、別々の問い合わせで書く。誰もこの問い合わせを待たない。
// 反応の行は代（起こした1回）につき1回だけ書き、`/clear` では挨拶だけを書き直す。

import type {
  WelcomeWritingFootprint,
  WelcomeWritingResult,
} from "../../../shared/diagnostic/welcome-writing.ts"
import type { WrittenReactions } from "../../../shared/recommendation/reaction.ts"
import type { WelcomeGreetingState } from "../../../shared/recommendation/welcome-greeting.ts"
import { type RetriedQueryPorts, type RetriedQueryTrace, runRetriedQuery } from "./retried-query.ts"
import {
  parseWelcomeGreeting,
  WELCOME_GREETING_RECENT_LIMIT,
  WELCOME_GREETING_TIMEOUT_MS,
  welcomeGreetingQuery,
  type WelcomeGreetingMaterial,
  type WelcomeGreetingText,
} from "./welcome-greeting.ts"
import {
  parseWrittenReactions,
  writtenReactionsQuery,
  type WrittenReactionsMaterial,
} from "./written-reaction.ts"

export type WelcomeGreeterPorts = RetriedQueryPorts & {
  /** 直近の挨拶を新しい順に読む（無い・読めないときは空）。 */
  readonly readRecent: () => readonly WelcomeGreetingText[]
  /** 直近の挨拶を丸ごと書く。失敗しても例外を投げない。 */
  readonly writeRecent: (recent: readonly WelcomeGreetingText[]) => void
  readonly emit: (state: WelcomeGreetingState) => void
  /** 反応の行が書けたときだけ呼ぶ。 */
  readonly emitReactions: (reactions: WrittenReactions) => void
  /** 書けなかった理由の知らせ口（中断では呼ばない）。`error` は問い合わせの失敗のときだけ実物が入る。 */
  readonly onUnwritten: (place: UnwrittenPlace, error: unknown) => void
  /** 書き込みを1回終えた足跡の知らせ口（書けても書けなくても1回。中断では呼ばない）。 */
  readonly report: (footprint: WelcomeWritingFootprint) => void
}

export type UnwrittenPlace =
  | (typeof greetingUnwrittenPlace)[UnwrittenResult]
  | (typeof reactionsUnwrittenPlace)[UnwrittenResult]

type UnwrittenResult = Exclude<WelcomeWritingResult, "written">

const greetingUnwrittenPlace = {
  failed: "welcome-greeting-failed",
  rejected: "welcome-greeting-rejected",
  "timed-out": "welcome-greeting-timed-out",
} as const satisfies Record<UnwrittenResult, string>

const reactionsUnwrittenPlace = {
  failed: "welcome-reactions-failed",
  rejected: "welcome-reactions-rejected",
  "timed-out": "welcome-reactions-timed-out",
} as const satisfies Record<UnwrittenResult, string>

/** 代ごとに1つ持つ。 */
export type WelcomeGreeter = {
  /** 代を起こしたときに1回だけ呼ぶ。挨拶と反応の行を同時に書き始める。 */
  readonly start: (material: Omit<WelcomeGreetingMaterial, "recent">) => void
  /** `/clear` のたびに呼ぶ。走っている挨拶の書き手を中断してから、挨拶だけを書き直す。 */
  readonly rewriteGreeting: (material: Omit<WelcomeGreetingMaterial, "recent">) => void
}

export function createWelcomeGreeter(ports: WelcomeGreeterPorts): WelcomeGreeter {
  let running: AbortController | undefined = undefined
  const writeGreeting = (material: Omit<WelcomeGreetingMaterial, "recent">): void => {
    running?.abort()
    const controller = new AbortController()
    running = controller
    void greetWelcome(ports, material, controller.signal, WELCOME_GREETING_TIMEOUT_MS)
  }
  return {
    start: (material) => {
      writeGreeting(material)
      void writeReactions(ports, material, WELCOME_GREETING_TIMEOUT_MS)
    },
    rewriteGreeting: writeGreeting,
  }
}

/**
 * 直近の挨拶を添えて問い合わせ、検査を通れば直近の先頭へ書いてから配る。
 *
 * 書き始めに `writing` を配る。1回目が失敗・検査落ちで、かつ `signal` も `timeoutMs` の締め切りも
 * まだ来ていなければ1回だけ問い合わせ直す。`signal` が中断していれば（新しい書き手に替わった）
 * 結果に関わらず何も配らない。それ以外で結果が無ければ `unwritten`、あれば `written` を配る。
 */
export async function greetWelcome(
  ports: WelcomeGreeterPorts,
  material: Omit<WelcomeGreetingMaterial, "recent">,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  ports.emit({ kind: "writing" })
  const recent = ports.readRecent()
  const full = { ...material, recent }

  const outcome = await runRetriedQuery(
    ports,
    welcomeGreetingQuery(full),
    (answer) => parseWelcomeGreeting(answer, full),
    signal,
    timeoutMs,
  )
  if (outcome.kind === "aborted") {
    return
  }
  ports.report(footprintOf(ports.now(), "greeting", outcome.kind, outcome.trace))
  if (outcome.kind !== "written") {
    ports.onUnwritten(
      greetingUnwrittenPlace[outcome.kind],
      outcome.kind === "failed" ? outcome.error : undefined,
    )
    ports.emit({ kind: "unwritten" })
    return
  }
  const greeting = outcome.value
  ports.writeRecent(
    [{ withCard: greeting.withCard, withoutCard: greeting.withoutCard }, ...recent].slice(
      0,
      WELCOME_GREETING_RECENT_LIMIT,
    ),
  )
  ports.emit({ kind: "written", greeting })
}

/** 反応の行を問い合わせ、書ければ配る。書けなければ何も配らない。 */
async function writeReactions(
  ports: WelcomeGreeterPorts,
  material: WrittenReactionsMaterial,
  timeoutMs: number,
): Promise<void> {
  const outcome = await runRetriedQuery(
    ports,
    writtenReactionsQuery(material),
    (answer) => parseWrittenReactions(answer, material.expressions),
    new AbortController().signal,
    timeoutMs,
  )
  if (outcome.kind === "aborted") {
    return
  }
  ports.report(footprintOf(ports.now(), "reactions", outcome.kind, outcome.trace))
  if (outcome.kind !== "written") {
    ports.onUnwritten(
      reactionsUnwrittenPlace[outcome.kind],
      outcome.kind === "failed" ? outcome.error : undefined,
    )
    return
  }
  ports.emitReactions(outcome.value)
}

function footprintOf(
  at: number,
  target: WelcomeWritingFootprint["target"],
  outcome: WelcomeWritingResult,
  trace: RetriedQueryTrace,
): WelcomeWritingFootprint {
  return { flow: "welcome-writing", at, target, outcome, ...trace }
}
