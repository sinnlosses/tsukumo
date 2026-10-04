// 迎えの挨拶の配線。新しく起こすセッションごとに、起こす代のパックで挨拶を背景で書かせ、
// その代の受け取り口に `/clear` が流れるたびに書き直す。

import { localCalendarAt } from "../server/adapter/local-time.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import {
  readRecentWelcomeGreetings,
  writeRecentWelcomeGreetings,
} from "../server/recommendation/adapter/welcome-greeting-memory.ts"
import { createWelcomeGreeter } from "../server/recommendation/core/welcome-greeter.ts"
import type { WelcomeGreetingMaterial } from "../server/recommendation/core/welcome-greeting.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import type { WiringContext } from "./wiring-context.ts"

/** 何も観ない観る口（起こす条件に当たらないとき）。 */
const NO_OBSERVER = (): void => {
  // 疑似セッション・雑談・続きから起こすときは書かせない。
}

export function wireWelcomeGreeting(context: WiringContext): {
  /**
   * 代を起こすたびに呼ぶ。`onEvent` はその代の受け取り口。
   * 戻り値は、その代の受け取り口に流れた出来事を観る口（`/clear` が来たら書き直す）。
   * 迎える局面になるのは新しく起こした仕事のセッションなので、疑似セッション・雑談・続きから起こすときは書かせない。
   */
  readonly noteLaunched: (
    seed: SessionLaunchSeed<CharacterPack>,
    onEvent: (event: SessionEvent) => void,
  ) => (event: SessionEvent) => void
} {
  const { cwd, inheritedEnv } = context
  return {
    noteLaunched: (seed, onEvent) => {
      if (context.fakeSession !== undefined || seed.chat || seed.start.kind !== "new") {
        return NO_OBSERVER
      }
      const greeter = createWelcomeGreeter({
        readRecent: () => readRecentWelcomeGreetings(),
        writeRecent: (recent) => {
          writeRecentWelcomeGreetings(recent)
        },
        query: (request, signal) => queryStructured(request, { cwd, env: inheritedEnv }, signal),
        emit: (state) => {
          onEvent({ kind: "welcome-greeting-changed", state })
        },
      })
      const material = (): Omit<WelcomeGreetingMaterial, "recent"> => ({
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        calendar: localCalendarAt(context.now()),
      })
      greeter.write(material())
      return (event) => {
        if (event.kind === "conversation-cleared") {
          greeter.write(material())
        }
      }
    },
  }
}
