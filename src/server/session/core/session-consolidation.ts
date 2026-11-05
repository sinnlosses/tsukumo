// 定着（会話の見直しの書き込み）を起こす係。プロセスの中で同時に1本だけ走らせ、終わったら結果を足跡と今の代へ流す。

import type { CharacterPackName } from "../../../shared/character-pack/character.ts"
import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type {
  ChatConsolidationOutcome,
  ChatConsolidationSource,
} from "../../chat/core/consolidation/chat-consolidation-writer.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"
import { noteConsolidationHalt, noteConsolidationOutcome } from "./consolidation-footprint.ts"
import { createConsolidationHalt } from "./consolidation-halt.ts"
import { mayFlowTopics } from "./event/event-judgement.ts"

export type SessionConsolidation = {
  /**
   * そのパックの定着を1本起こす（走っていれば何もしない）。
   * 書くのは起こした時点のパックのファイルで、書けたときの話題の見出しは、そのときの状態が雑談で同じパックのときだけ今の代へ流す。
   * 起こし直しのあとに遅れて届いた結果が、別のパックの画面に混ざらないため。
   */
  readonly start: (packName: CharacterPackName) => void
  /** 走っている1本を中断する（待たない。書きかけで止まれば追記済みまでが定着）。 */
  readonly abort: () => void
}

type SessionConsolidationDeps = {
  readonly source: ChatConsolidationSource
  readonly diagnostic: DiagnosticBuffer
  readonly now: () => number
  readonly state: () => SessionState
  readonly isClosed: () => boolean
  /** 今の代へイベントを流す。 */
  readonly emit: (event: SessionEvent) => void
}

export function createSessionConsolidation(deps: SessionConsolidationDeps): SessionConsolidation {
  const { source, diagnostic, now } = deps
  // 代ではなくここに持つ。
  // 起こし直しをまたいでも同時に1本のまま（同じパックへ起こし直した直後に、同じ未定着の行を2本で畳まない）。
  // 走っているあいだの契機は捨てる。
  let consolidating = false
  const consolidationHalt = createConsolidationHalt()
  const consolidationAbort = new AbortController()

  const start = (packName: CharacterPackName): void => {
    if (source.kind === "dont-consolidate" || consolidating || consolidationHalt.isHalted()) {
      return
    }
    consolidating = true
    const settle = (outcome: ChatConsolidationOutcome): void => {
      consolidating = false
      noteConsolidationOutcome(outcome, diagnostic, now)
      const haltedAfter = consolidationHalt.note(outcome)
      if (haltedAfter !== undefined) {
        noteConsolidationHalt(diagnostic, now)
        if (!deps.isClosed()) {
          deps.emit({
            kind: "chat-consolidation-halted",
            failures: haltedAfter,
          })
        }
      }
      if (mayFlowTopics(outcome, deps.isClosed(), deps.state(), packName)) {
        deps.emit({ kind: "chat-topics-changed", topics: outcome.topics })
      }
    }
    const run = async (): Promise<void> => {
      try {
        settle(
          await source.consolidate(packName, consolidationAbort.signal).catch(consolidationThrew),
        )
      } catch (error) {
        consolidating = false
        diagnostic.add(
          swallowedFailureFootprint(
            now(),
            { feature: "chat", place: "consolidation-threw" },
            error,
          ),
        )
      }
    }
    void run()
  }

  return {
    start,
    abort: () => {
      consolidationAbort.abort()
    },
  }
}

function consolidationThrew(error: unknown): ChatConsolidationOutcome {
  return { kind: "failed", reason: "threw", error }
}
