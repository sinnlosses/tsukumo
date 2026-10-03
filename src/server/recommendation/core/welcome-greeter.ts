// 迎えの挨拶を1回書く。誰もこの問い合わせを待たない。

import type { WelcomeGreeting } from "../../../shared/recommendation/welcome-greeting.ts"
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
  readonly emit: (greeting: WelcomeGreeting) => void
}

/**
 * 直近の挨拶を添えて問い合わせ、検査を通れば直近の先頭へ書いてから配る。
 * 失敗・時間切れ・検査落ちでは何も配らない。決して reject しない。
 */
export async function greetWelcome(
  ports: WelcomeGreeterPorts,
  material: Omit<WelcomeGreetingMaterial, "recent">,
): Promise<void> {
  const recent = ports.readRecent()
  const signal = AbortSignal.timeout(WELCOME_GREETING_TIMEOUT_MS)
  try {
    const full = { ...material, recent }
    const greeting = parseWelcomeGreeting(
      await ports.query(welcomeGreetingQuery(full), signal),
      full,
    )
    if (greeting === undefined || signal.aborted) {
      return
    }
    ports.writeRecent(
      [{ withCard: greeting.withCard, withoutCard: greeting.withoutCard }, ...recent].slice(
        0,
        WELCOME_GREETING_RECENT_LIMIT,
      ),
    )
    ports.emit(greeting)
  } catch {
    // 起こせない・時間切れ・API の失敗。どれもパックの行のまま残すので分けない。
  }
}
