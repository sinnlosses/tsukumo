// 書けた迎えの挨拶と反応の行を、プロセスの中でセッションごとに覚え、同じセッションへ戻る代でそのまま出し直す。
// ディスクには書かない。

import type { WrittenReactionsState } from "../../../shared/recommendation/reaction.ts"
import type { WelcomeGreeting } from "../../../shared/recommendation/welcome-greeting.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"

/** 代の起こし方（`SessionStart` と同じ形）。 */
export type WelcomeLaunchStart =
  | { readonly kind: "new" }
  | { readonly kind: "resume"; readonly sessionId: string }

/** 書き手が流す出来事。 */
export type WelcomeWritingEvent = Extract<
  SessionEvent,
  { readonly kind: "welcome-greeting-changed" | "reactions-written" }
>

/** プロセスに1つ持つ。 */
export type WelcomeKeeper = {
  /** 代を起こすたびに呼ぶ。`emit` はその代の受け取り口。 */
  readonly noteLaunched: (
    start: WelcomeLaunchStart,
    emit: (event: WelcomeWritingEvent) => void,
  ) => KeptWelcomeLaunch
}

/** 代ごとの口。 */
export type KeptWelcomeLaunch = {
  /** このセッションで覚えた挨拶があれば、反応の行（覚えていれば）と一緒に流し直して true。無ければ何も流さず false。 */
  readonly replay: () => boolean
  /** 書き手の出来事を受け取り口へ流し、書けた挨拶・反応の行を覚える（受け取り口が代を閉じて捨てても覚える）。 */
  readonly emit: (event: WelcomeWritingEvent) => void
  /** その代の受け取り口に流れた出来事を観る。`session-info` でセッションIDを結び、`/clear` で覚えた挨拶を外す。 */
  readonly observe: (event: SessionEvent) => void
}

type KeptWelcome = {
  readonly greeting: WelcomeGreeting
  readonly reactions: WrittenReactionsState
}

export function createWelcomeKeeper(): WelcomeKeeper {
  const kept = new Map<string, KeptWelcome>()
  return {
    noteLaunched: (start, emit) => {
      let sessionId: string | undefined = start.kind === "resume" ? start.sessionId : undefined
      let greeting: WelcomeGreeting | undefined = undefined
      let reactions: WrittenReactionsState = { kind: "none" }
      const keep = (): void => {
        if (sessionId === undefined) {
          return
        }
        if (greeting === undefined) {
          kept.delete(sessionId)
          return
        }
        kept.set(sessionId, { greeting, reactions })
      }
      return {
        replay: () => {
          const found = sessionId === undefined ? undefined : kept.get(sessionId)
          if (found === undefined) {
            return false
          }
          greeting = found.greeting
          reactions = found.reactions
          emit({
            kind: "welcome-greeting-changed",
            state: { kind: "written", greeting: found.greeting },
          })
          if (found.reactions.kind === "written") {
            emit({ kind: "reactions-written", reactions: found.reactions.reactions })
          }
          return true
        },
        emit: (event) => {
          if (event.kind === "welcome-greeting-changed" && event.state.kind === "written") {
            greeting = event.state.greeting
            keep()
          }
          if (event.kind === "reactions-written") {
            reactions = { kind: "written", reactions: event.reactions }
            keep()
          }
          emit(event)
        },
        observe: (event) => {
          if (event.kind === "session-info" && event.sessionId !== sessionId) {
            sessionId = event.sessionId
            keep()
          }
          if (event.kind === "conversation-cleared") {
            greeting = undefined
            keep()
          }
        },
      }
    },
  }
}
