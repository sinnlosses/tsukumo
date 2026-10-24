// 迎えの挨拶を1回書く。直近の挨拶を添えて問い合わせ、検査を通れば直近へ書いてから配る。

import type {
  WelcomeRejection,
  WelcomeWritingFootprint,
  WelcomeWritingResult,
} from "../../../shared/diagnostic/welcome-writing.ts"
import type { WelcomeGreetingState } from "../../../shared/recommendation/welcome-greeting.ts"
import {
  type RetriedQueryPorts,
  type RetriedQueryTrace,
  runRetriedQuery,
} from "../../core/structured-query.ts"
import {
  parseWelcomeGreeting,
  WELCOME_GREETING_HEDGE_MS,
  WELCOME_GREETING_RECENT_LIMIT,
  welcomeGreetingQuery,
  type WelcomeGreetingMaterial,
  type WelcomeGreetingText,
} from "./welcome-greeting.ts"

export type WelcomeGreetingWriterPorts = RetriedQueryPorts & {
  /** 直近の挨拶を新しい順に読む（無い・読めないときは空）。 */
  readonly readRecent: () => readonly WelcomeGreetingText[]
  /** 直近の挨拶を丸ごと書く。失敗しても例外を投げない。 */
  readonly writeRecent: (recent: readonly WelcomeGreetingText[]) => void
  readonly emit: (state: WelcomeGreetingState) => void
  /** 書けなかった理由の知らせ口（中断では呼ばない）。`error` は問い合わせの失敗のときだけ実物が入る。 */
  readonly onUnwritten: (place: GreetingUnwrittenPlace, error: unknown) => void
  /** 書き込みを1回終えた足跡の知らせ口（書けても書けなくても1回。中断では呼ばない）。 */
  readonly report: (footprint: WelcomeWritingFootprint) => void
}

export type UnwrittenResult = Exclude<WelcomeWritingResult, "written">

export type GreetingUnwrittenPlace = (typeof greetingUnwrittenPlace)[UnwrittenResult]

const greetingUnwrittenPlace = {
  failed: "welcome-greeting-failed",
  rejected: "welcome-greeting-rejected",
  "timed-out": "welcome-greeting-timed-out",
} as const satisfies Record<UnwrittenResult, string>

/**
 * 直近の挨拶を添えて問い合わせ、検査を通れば直近の先頭へ書いてから配る。
 *
 * 書き始めに `writing` を配る。1回目が失敗・検査落ちで、かつ `signal` も `timeoutMs` の締め切りも
 * まだ来ていなければ1回だけ問い合わせ直す。`signal` が中断していれば（新しい書き手に替わった）
 * 結果に関わらず何も配らない。それ以外で結果が無ければ `unwritten`、あれば `written` を配る。
 */
export async function greetWelcome(
  ports: WelcomeGreetingWriterPorts,
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
    WELCOME_GREETING_HEDGE_MS,
  )
  if (outcome.kind === "aborted") {
    return
  }
  ports.report(welcomeWritingFootprint(ports.now(), "greeting", outcome.kind, outcome.trace))
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

/** 書き込み1回の足跡。 */
export function welcomeWritingFootprint(
  at: number,
  target: WelcomeWritingFootprint["target"],
  outcome: WelcomeWritingResult,
  trace: RetriedQueryTrace<WelcomeRejection>,
): WelcomeWritingFootprint {
  return { flow: "welcome-writing", at, target, outcome, ...trace }
}
