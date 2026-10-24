// 迎えの挨拶と反応の行を、別々の問い合わせで書く。誰もこの問い合わせを待たない。
// 反応の行は代（起こした1回）につき1回だけ書き、`/clear` では挨拶だけを書き直す。

import type { WrittenReactions } from "../../../shared/recommendation/reaction.ts"
import { runRetriedQuery } from "./retried-query.ts"
import {
  type GreetingUnwrittenPlace,
  greetWelcome,
  type UnwrittenResult,
  type WelcomeGreetingWriterPorts,
  welcomeWritingFootprint,
} from "./welcome-greeting-writer.ts"
import {
  WELCOME_GREETING_HEDGE_MS,
  WELCOME_GREETING_TIMEOUT_MS,
  type WelcomeGreetingMaterial,
} from "./welcome-greeting.ts"
import {
  parseWrittenReactions,
  writtenReactionsQuery,
  type WrittenReactionsMaterial,
} from "./written-reaction.ts"

export type WelcomeGreeterPorts = Omit<WelcomeGreetingWriterPorts, "onUnwritten"> & {
  /** 反応の行が書けたときだけ呼ぶ。 */
  readonly emitReactions: (reactions: WrittenReactions) => void
  /** 書けなかった理由の知らせ口（中断では呼ばない）。`error` は問い合わせの失敗のときだけ実物が入る。 */
  readonly onUnwritten: (place: UnwrittenPlace, error: unknown) => void
}

export type UnwrittenPlace =
  | GreetingUnwrittenPlace
  | (typeof reactionsUnwrittenPlace)[UnwrittenResult]

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
    WELCOME_GREETING_HEDGE_MS,
  )
  if (outcome.kind === "aborted") {
    return
  }
  ports.report(welcomeWritingFootprint(ports.now(), "reactions", outcome.kind, outcome.trace))
  if (outcome.kind !== "written") {
    ports.onUnwritten(
      reactionsUnwrittenPlace[outcome.kind],
      outcome.kind === "failed" ? outcome.error : undefined,
    )
    return
  }
  ports.emitReactions(outcome.value)
}
