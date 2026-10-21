// 迎えの挨拶と反応の行の配線。代を起こすたびに、起こす代のパックで両方を背景で書かせ
// （続きから起こした代は組み直した履歴から決めた迎え方で）、
// その代の受け取り口に `/clear` が流れるたびに挨拶だけを書き直す。
// 同じプロセスの中で前に書けたセッションへ続きから戻る代は、書かせずに覚えたものを出し直す。

import { localCalendarAt } from "../server/adapter/local-time.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import {
  readRecentWelcomeGreetings,
  writeRecentWelcomeGreetings,
} from "../server/recommendation/adapter/welcome-greeting-memory.ts"
import { createWelcomeKeeper } from "../server/recommendation/core/kept-welcome.ts"
import { resumedWelcome } from "../server/recommendation/core/resumed-welcome.ts"
import { createWelcomeGreeter } from "../server/recommendation/core/welcome-greeter.ts"
import {
  START_VISIT,
  type WelcomeGreetingMaterial,
  type WelcomeVisit,
} from "../server/recommendation/core/welcome-greeting.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { RestoredEvent, SessionEvent } from "../shared/session/session-event.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireWelcomeGreeting(
  context: WiringContext,
  diagnosticLog: DiagnosticLog,
): {
  /**
   * 代を起こすたびに呼ぶ。`onEvent` はその代の受け取り口、`restored` はその代で組み直した履歴。
   * 戻り値は、その代の受け取り口に流れた出来事を観る口（`/clear` が来たら書き直す）。
   * 疑似セッション・雑談では書かせない。
   */
  readonly noteLaunched: (
    seed: SessionLaunchSeed<CharacterPack>,
    onEvent: (event: SessionEvent) => void,
    restored: Promise<readonly RestoredEvent[]>,
  ) => (event: SessionEvent) => void
} {
  const { cwd, inheritedEnv } = context
  const reportFailure = failureDiagnostic(diagnosticLog, context.now)
  const keeper = createWelcomeKeeper()
  return {
    noteLaunched: (seed, onEvent, restored) => {
      if (context.fakeSession !== undefined || seed.chat) {
        return NO_OBSERVER
      }
      const kept = keeper.noteLaunched(seed.start, onEvent)
      const greeter = createWelcomeGreeter({
        readRecent: () => readRecentWelcomeGreetings(seed.pack.name),
        writeRecent: (recent) => {
          writeRecentWelcomeGreetings(seed.pack.name, recent)
        },
        query: (request, signal) => queryStructured(request, { cwd, env: inheritedEnv }, signal),
        now: context.now,
        emit: (state) => {
          kept.emit({ kind: "welcome-greeting-changed", state })
        },
        emitReactions: (reactions) => {
          kept.emit({ kind: "reactions-written", reactions })
        },
        onUnwritten: (place, error) => {
          reportFailure({ feature: "recommendation", place }, error)
        },
        report: (footprint) => {
          diagnosticLog.append([footprint])
        },
      })
      const material = (visit: WelcomeVisit): Omit<WelcomeGreetingMaterial, "recent"> => ({
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        calendar: localCalendarAt(context.now()),
        visit,
      })
      switch (seed.start.kind) {
        case "new":
          greeter.start(material(START_VISIT))
          break
        case "resume":
          restored.then(
            (events) => {
              if (!kept.replay()) {
                greeter.start(material(resumedWelcome(events, context.now())))
              }
            },
            (error: unknown) => {
              reportFailure({ feature: "session", place: "restore-events" }, error)
            },
          )
          break
      }
      return (event) => {
        kept.observe(event)
        if (event.kind === "conversation-cleared") {
          greeter.rewriteGreeting(material(START_VISIT))
        }
      }
    },
  }
}

/** 何も観ない観る口（疑似セッション・雑談のとき）。 */
const NO_OBSERVER = (): void => {
  // 疑似セッション・雑談では書かせない。
}
