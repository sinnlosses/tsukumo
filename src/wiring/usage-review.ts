// 見直しの配線。前回の結果の読み書きと、見直しの走りと、トークン消費の画面から届くコマンドの中身を選ぶ。

import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { readBeadsWorkspace } from "../server/repository/adapter/beads.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager-port.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "../server/usage-review/adapter/previous-usage-review.ts"
import {
  queryUsageProposal,
  queryUsageReview,
} from "../server/usage-review/adapter/sdk-usage-review.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../server/usage-review/adapter/usage-proposal-dismissal.ts"
import type { UsageReviewCommandPorts } from "../server/usage-review/core/usage-review-command.ts"
import {
  createUsageReviewRunner,
  type UsageReviewPackContext,
  type UsageReviewSource,
} from "../server/usage-review/core/usage-review-runner.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { UsageProposalKeyInput } from "../shared/contract/usage-review.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import { usageProposalKey, withoutDismissedProposals } from "../shared/usage-review/usage-review.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireUsageReview(
  context: WiringContext,
  mountWorkflowPlugin: boolean,
): {
  readonly manager: Pick<SessionManagerOptions, "readPreviousUsageReview">
  readonly commands: UsageReviewCommandPorts
  /**
   * 代を起こすたびに呼ぶ（疑似セッションでも）。
   * キャラクターを切り替えたあとの見直しは、切り替えたあとのパックで走る。
   */
  readonly noteLaunched: (seed: SessionLaunchSeed<CharacterPack>) => void
  /** 走っている見直しか提案の実行を止める（プロセスを終えるとき）。 */
  readonly close: () => void
} {
  let latest: UsageReviewPackContext | undefined = undefined
  const runner = createUsageReviewRunner({
    source: usageReviewSource(context, mountWorkflowPlugin),
    readContext: () => latest,
    dismissedKeys: () => readDismissedUsageProposalKeys(),
    hasTaskOperation: async () => (await readBeadsWorkspace(context.cwd)).kind === "found",
    writePreviousUsageReview,
    now: context.now,
  })
  return {
    manager: {
      // 前回の見直しの結果は、読むときに見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
      readPreviousUsageReview: () =>
        withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
    },
    commands: { dismissUsageProposal, runner },
    noteLaunched: (seed) => {
      latest = {
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        cwd: context.cwd,
        env: context.inheritedEnv,
      }
    },
    close: runner.close,
  }
}

/** 走らせる口の出どころ。疑似セッションなら問い合わせを起こさず、疑似セッションに書いた手順を流す。 */
function usageReviewSource(
  context: WiringContext,
  mountWorkflowPlugin: boolean,
): UsageReviewSource {
  const { driver } = context
  switch (driver.kind) {
    case "fake":
      return { kind: "replay", ...driver.session.usageReview }
    case "sdk":
      return {
        kind: "query",
        review: queryUsageReview,
        proposal: (request, onEvent, signal) =>
          queryUsageProposal(request, onEvent, signal, mountWorkflowPlugin),
      }
    default:
      return driver satisfies never
  }
}

/**
 * 提案を1件見送る。識別子（種類と対象の組）で書き、同じ識別子を返す（画面はこの識別子で札を消す）。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 */
function dismissUsageProposal(dismiss: UsageProposalKeyInput): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}
