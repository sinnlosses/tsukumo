// `effectsOfEvent` が決めたやることを、駆動の持ち物に対して実行する。

import type { EventEffect } from "../core/event-effect.ts"
import type { InputLedgerIntake } from "../core/input-ledger.ts"
import type { SessionDriverOptions } from "../core/session-driver.ts"
import type { SessionTitleIntake } from "../core/session-title.ts"
import { appendInputLedger } from "./input-ledger-file.ts"
import { markSession, type SessionTitleWriter } from "./sdk-session.ts"

export type EventEffectTarget = {
  readonly options: SessionDriverOptions
  readonly ledgerIntake: InputLedgerIntake
  readonly titleIntake: SessionTitleIntake
  readonly titleWriter: SessionTitleWriter
}

/** `message` はこのイベントを生んだ SDK のメッセージ。 */
export function runEventEffect(
  effect: EventEffect,
  message: unknown,
  target: EventEffectTarget,
): void {
  const { options, ledgerIntake, titleIntake, titleWriter } = target
  switch (effect.kind) {
    case "append-input-ledger": {
      const ledgerEntry = ledgerIntake.finishTurn(message, effect.outcome)
      if (ledgerEntry !== undefined) {
        appendInputLedger(ledgerEntry)
      }
      break
    }
    case "finish-persona-turn": {
      // 1ターンに書けるのは1行まで。終わるたびに次の1行を受け付けさせる。
      effect.personaMemory.finishTurn()
      break
    }
    case "mark-session-and-write-title": {
      void markSession(effect.sessionId, options)
      const title = titleIntake.take()
      if (title !== undefined) {
        void titleWriter.write(effect.sessionId, title, options)
      }
      break
    }
    case "mark-summary-undelivered": {
      // `/clear` を見た合図。写しの印を「未渡し」に戻す。
      // 印はターンが終わるたびにそのときのセッションIDへ付け直されるので、ここで戻さないと、次に起こしたとき記憶が二度と戻らない。
      effect.chatSummary.markUndelivered()
      break
    }
    case "note-conversation-cleared": {
      titleWriter.noteConversationCleared()
      break
    }
  }
}
