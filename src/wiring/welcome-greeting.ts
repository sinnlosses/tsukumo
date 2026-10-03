// 迎えの挨拶の配線。新しく起こすセッションごとに、起こす代のパックで挨拶を背景で1回書かせる。

import { localCalendarAt } from "../server/adapter/local-time.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import {
  readRecentWelcomeGreetings,
  writeRecentWelcomeGreetings,
} from "../server/recommendation/adapter/welcome-greeting-memory.ts"
import { greetWelcome } from "../server/recommendation/core/welcome-greeter.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireWelcomeGreeting(context: WiringContext): {
  /**
   * 代を起こすたびに呼ぶ。`onEvent` はその代の受け取り口。
   * 迎える局面になるのは新しく起こした仕事のセッションなので、疑似セッション・雑談・続きから起こすときは書かせない。
   */
  readonly noteLaunched: (
    seed: SessionLaunchSeed<CharacterPack>,
    onEvent: (event: SessionEvent) => void,
  ) => void
} {
  const { cwd, inheritedEnv } = context
  return {
    noteLaunched: (seed, onEvent) => {
      if (context.fakeSession !== undefined || seed.chat || seed.start.kind !== "new") {
        return
      }
      void greetWelcome(
        {
          readRecent: () => readRecentWelcomeGreetings(),
          writeRecent: (recent) => {
            writeRecentWelcomeGreetings(recent)
          },
          query: (request, signal) => queryStructured(request, { cwd, env: inheritedEnv }, signal),
          emit: (greeting) => {
            onEvent({ kind: "welcome-greeting-changed", greeting })
          },
        },
        {
          persona: seed.pack.persona ?? "",
          expressions: expressionChoices(seed.pack.definition),
          calendar: localCalendarAt(context.now()),
        },
      )
    },
  }
}
