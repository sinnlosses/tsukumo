// 迎えの挨拶を書く。誰もこの問い合わせを待たない。

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
}

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
 * 結果に関わらず何も配らない。それ以外で結果が無ければ `fallback`、あれば `written` を配る。
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

  const attempt = async (): Promise<WelcomeGreeting | undefined> => {
    try {
      return parseWelcomeGreeting(await ports.query(welcomeGreetingQuery(full), bounded), full)
    } catch {
      return undefined
    }
  }

  const greeting = (await attempt()) ?? (bounded.aborted ? undefined : await attempt())

  if (signal.aborted) {
    return
  }
  if (greeting === undefined) {
    ports.emit({ kind: "fallback" })
    return
  }
  ports.writeRecent(
    [{ withCard: greeting.withCard, withoutCard: greeting.withoutCard }, ...recent].slice(
      0,
      WELCOME_GREETING_RECENT_LIMIT,
    ),
  )
  ports.emit({ kind: "written", greeting })
}
