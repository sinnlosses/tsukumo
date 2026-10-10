// 迎えの挨拶と、同じ答えで反応の行を書く。誰もこの問い合わせを待たない。

import type {
  WelcomeGreeting,
  WelcomeGreetingState,
} from "../../../shared/recommendation/welcome-greeting.ts"
import type { StructuredQuery } from "./structured-query.ts"
import {
  parseWelcomeGreeting,
  WELCOME_GREETING_RECENT_LIMIT,
  WELCOME_GREETING_TIMEOUT_MS,
  welcomeGreetingQuery,
  type WelcomeGreetingMaterial,
  type WelcomeGreetingText,
} from "./welcome-greeting.ts"

export type WelcomeGreeterPorts = {
  /** 直近の挨拶を新しい順に読む（無い・読めないときは空）。 */
  readonly readRecent: () => readonly WelcomeGreetingText[]
  /** 直近の挨拶を丸ごと書く。失敗しても例外を投げない。 */
  readonly writeRecent: (recent: readonly WelcomeGreetingText[]) => void
  /** 問い合わせを1回走らせ、`structured_output` をそのまま返す。失敗・中断では reject する。 */
  readonly query: (request: StructuredQuery, signal: AbortSignal) => Promise<unknown>
  readonly emit: (state: WelcomeGreetingState) => void
  /** `unwritten` を配る理由の知らせ口（中断では呼ばない）。`error` は問い合わせの失敗のときだけ実物が入る。 */
  readonly onUnwritten: (place: UnwrittenPlace, error: unknown) => void
}

export type UnwrittenPlace =
  | "welcome-greeting-failed"
  | "welcome-greeting-rejected"
  | "welcome-greeting-timed-out"

type Attempt =
  | { readonly kind: "written"; readonly greeting: WelcomeGreeting }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "rejected" }

const unwrittenPlace = {
  failed: "welcome-greeting-failed",
  rejected: "welcome-greeting-rejected",
} as const satisfies Record<"failed" | "rejected", UnwrittenPlace>

/** 代ごとに1つ持ち、書き直す契機のたびに `write` を呼ぶ。 */
export type WelcomeGreeter = {
  /** 前に走っている書き手があれば中断してから、新しい材料で書き始める。 */
  readonly write: (material: Omit<WelcomeGreetingMaterial, "recent">) => void
}

export function createWelcomeGreeter(ports: WelcomeGreeterPorts): WelcomeGreeter {
  let running: AbortController | undefined = undefined
  return {
    write: (material) => {
      running?.abort()
      const controller = new AbortController()
      running = controller
      void greetWelcome(ports, material, controller.signal, WELCOME_GREETING_TIMEOUT_MS)
    },
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
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  const recent = ports.readRecent()
  const full = { ...material, recent }

  const attempt = async (): Promise<Attempt> => {
    let answer: unknown = undefined
    try {
      answer = await ports.query(welcomeGreetingQuery(full), bounded)
    } catch (error) {
      return { kind: "failed", error }
    }
    const greeting = parseWelcomeGreeting(answer, full)
    return greeting === undefined ? { kind: "rejected" } : { kind: "written", greeting }
  }

  const first = await attempt()
  const last = first.kind !== "written" && !bounded.aborted ? await attempt() : first

  if (signal.aborted) {
    return
  }
  if (last.kind !== "written") {
    ports.onUnwritten(
      bounded.aborted ? "welcome-greeting-timed-out" : unwrittenPlace[last.kind],
      last.kind === "failed" ? last.error : undefined,
    )
    ports.emit({ kind: "unwritten" })
    return
  }
  const greeting = last.greeting
  ports.writeRecent(
    [{ withCard: greeting.withCard, withoutCard: greeting.withoutCard }, ...recent].slice(
      0,
      WELCOME_GREETING_RECENT_LIMIT,
    ),
  )
  ports.emit({ kind: "written", greeting })
}
