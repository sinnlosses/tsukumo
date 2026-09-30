// 訪問の配線。客の候補・台本の出どころと、歯車の「訪問」のオン・オフを覚える口を選ぶ。

import { readAchievement } from "../server/achievement/adapter/main-history.ts"
import { localTimeHHMM, todayLocalDateKey } from "../server/adapter/local-time.ts"
import { listCharacterPacks } from "../server/character-pack/adapter/character-pack.ts"
import { writeRememberedVisitEnabled } from "../server/session/adapter/remembered-default.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import { queryVisitScript } from "../server/visit/adapter/sdk-visit-script.ts"
import { createVisitClock } from "../server/visit/adapter/visit-clock.ts"
import type { VisitCommandPorts } from "../server/visit/core/visit-command.ts"
import { visitGuests } from "../server/visit/core/visit-guest.ts"
import {
  createVisitScriptWriter,
  type VisitScriptSource,
} from "../server/visit/core/visit-script-writer.ts"
import { visitCast } from "../server/visit/core/visit-script.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "../server/visit/core/visit-timing.ts"
import { UNKNOWN_ACHIEVEMENT } from "../shared/achievement/achievement.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireVisit(
  context: WiringContext,
  quickVisit: boolean,
): {
  readonly manager: Pick<SessionManagerOptions, "visit">
  readonly commands: VisitCommandPorts
} {
  return {
    manager: {
      // 客の候補は来るときにパックの一覧を読み直して拾う（画面から作った・直したパックもその場で効く）。
      visit: {
        timing: quickVisit ? QUICK_VISIT_TIMING : VISIT_TIMING,
        clock: createVisitClock(),
        listGuests: () => visitGuests(listCharacterPacks(context.cwd)),
        random: Math.random,
        // 台本はその場で作る。疑似セッションでは claude を起こさないので、パックの台本だけ。
        scriptSource:
          context.fakeSession === undefined ? visitScriptSource(context) : { kind: "pack-only" },
      },
    },
    commands: { rememberVisitEnabled },
  }
}

/**
 * 訪問の台本をその場で作る口。
 * 人格と表情は作るときにパックの一覧を読み直し、今日の成果は読めなければ「分からない」にする。
 * `query()` は仕事のセッションと同じ作業先・引き継いだ環境で起こす。
 */
function visitScriptSource(context: WiringContext): VisitScriptSource {
  const { cwd, inheritedEnv, achievementCommitCache, now } = context
  return {
    kind: "write",
    write: createVisitScriptWriter({
      readCast: (host, guest) => visitCast(listCharacterPacks(cwd), host, guest),
      readAchievement: async () => {
        const today = todayLocalDateKey()
        const result = await readAchievement(cwd, today, today, achievementCommitCache)
        return result.kind === "ok" ? result.achievement : UNKNOWN_ACHIEVEMENT
      },
      localTime: () => localTimeHHMM(now()),
      query: (request, signal) => queryVisitScript(request, { cwd, env: inheritedEnv }, signal),
    }),
  }
}

/**
 * 歯車から届いた「訪問」のオン・オフを覚え、画面へ流すイベントを返す。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 * このイベントは駆動由来のイベントと同じ `receive` を通るので、いま動いているセッションの訪問の見張りにも即座に届く。
 */
function rememberVisitEnabled(visitEnabled: boolean): SessionEvent {
  writeRememberedVisitEnabled(visitEnabled)
  return { kind: "visit-enabled-changed", visitEnabled }
}
