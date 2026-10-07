// 迎えの挨拶（と同じ答えで書かせる反応の行）の配線。代を起こすたびに、起こす代のパックで背景で書かせ
// （続きから起こした代は組み直した履歴から決めた迎え方で）、
// その代の受け取り口に `/clear` が流れるたびに書き直す。

import { localCalendarAt } from "../server/adapter/local-time.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { queryStructured } from "../server/recommendation/adapter/sdk-structured-query.ts"
import {
  readRecentWelcomeGreetings,
  writeRecentWelcomeGreetings,
} from "../server/recommendation/adapter/welcome-greeting-memory.ts"
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
import type { WiringContext } from "./wiring-context.ts"

/** 何も観ない観る口（疑似セッション・雑談のとき）。 */
const NO_OBSERVER = (): void => {
  // 疑似セッション・雑談では書かせない。
}

export function wireWelcomeGreeting(context: WiringContext): {
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
  return {
    noteLaunched: (seed, onEvent, restored) => {
      if (context.fakeSession !== undefined || seed.chat) {
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
      const material = (visit: WelcomeVisit): Omit<WelcomeGreetingMaterial, "recent"> => ({
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        calendar: localCalendarAt(context.now()),
        visit,
      })
      switch (seed.start.kind) {
        case "new":
          greeter.write(material(START_VISIT))
          break
        case "resume":
          void restored.then((events) => {
            greeter.write(material(resumedWelcome(events, context.now())))
          })
          break
      }
      return (event) => {
        if (event.kind === "conversation-cleared") {
          greeter.write(material(START_VISIT))
        }
      }
    },
  }
}
