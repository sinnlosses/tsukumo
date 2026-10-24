// 迎えの書き手のテストが共有する、偽の口と架空の材料。

import type {
  UnwrittenPlace,
  WelcomeGreeterPorts,
} from "../../src/server/welcome-greeting/core/welcome-greeter.ts"
import type { WelcomeGreetingText } from "../../src/server/welcome-greeting/core/welcome-greeting.ts"
import type { WelcomeWritingFootprint } from "../../src/shared/diagnostic/welcome-writing.ts"
import type { WrittenReactions } from "../../src/shared/recommendation/reaction.ts"
import type { WelcomeGreetingState } from "../../src/shared/recommendation/welcome-greeting.ts"

// すべて手で書いた架空の材料と出力。

export const WELCOME_MATERIAL = {
  persona: "架空の人格",
  expressions: [{ name: "default", label: "架空のふつう" }],
  calendar: { month: 1, dayOfWeek: 1, hour: 12 },
  visit: { kind: "start" },
} as const

export const WELCOME_OUTPUT = {
  withCard: "架空の挨拶、{札} から",
  withoutCard: "架空の挨拶",
  expression: "default",
}

/** 偽の時計の始まり（エポックミリ秒）。 */
export const WELCOME_START_AT = 1_000_000

/**
 * 問い合わせの1件。結果は外から解く（`signal` が中断すれば自分で reject する。実物の `query()` と同じ契約）。
 * 時計は `advance` で進めるまで止まっている。
 */
export function welcomeGreeterHarness(recent: readonly WelcomeGreetingText[] = []): {
  readonly ports: WelcomeGreeterPorts
  readonly written: (readonly WelcomeGreetingText[])[]
  readonly emitted: WelcomeGreetingState[]
  readonly queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[]
  readonly unwritten: { readonly place: UnwrittenPlace; readonly error: unknown }[]
  readonly reported: WelcomeWritingFootprint[]
  readonly reactions: WrittenReactions[]
  readonly advance: (ms: number) => void
} {
  const written: (readonly WelcomeGreetingText[])[] = []
  const emitted: WelcomeGreetingState[] = []
  const reactions: WrittenReactions[] = []
  const unwritten: { place: UnwrittenPlace; error: unknown }[] = []
  const reported: WelcomeWritingFootprint[] = []
  const queries: {
    readonly prompt: string
    readonly settle: (value: unknown) => void
    readonly fail: () => void
  }[] = []
  let clock = WELCOME_START_AT
  const ports: WelcomeGreeterPorts = {
    readRecent: () => recent,
    writeRecent: (entries) => {
      written.push(entries)
    },
    query: (request, signal) =>
      new Promise((resolve, reject) => {
        queries.push({
          prompt: request.prompt,
          settle: resolve,
          fail: () => reject(new Error("架空")),
        })
        signal.addEventListener("abort", () => {
          reject(new Error("架空の中断"))
        })
      }),
    now: () => clock,
    emit: (state) => {
      emitted.push(state)
    },
    emitReactions: (entry) => {
      reactions.push(entry)
    },
    onUnwritten: (place, error) => {
      unwritten.push({ place, error })
    },
    report: (footprint) => {
      reported.push(footprint)
    },
  }
  const advance = (ms: number): void => {
    clock += ms
  }
  return { ports, written, emitted, queries, unwritten, reported, reactions, advance }
}

/** 解いた問い合わせの続きが走り終わるのを待つ。 */
export function flushWelcomeWriting(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
