// ビューとセッションの両側が共有する入れ物の組み立てと、両側を起こして繋ぐところ。
// 共有する入れ物（記録の口・画像の棚・Beads の読み・いま出すキャラクター）はここで1つずつ作って両側へ渡す。
// 両側が別の入れ物を持つと、片側が置いたものをもう片側が引けない。

import { createAchievementCache } from "../server/achievement/adapter/closed-issue.ts"
import {
  createServerClock,
  millisecondsUntilNextLocalDay,
  todayLocalDateKey,
} from "../server/adapter/local-time.ts"
import { createChatArchive, pruneChatImages } from "../server/chat/adapter/chat-archive.ts"
import type { Config } from "../server/core/config.ts"
import type { Host } from "../server/host/core/host.ts"
import { readItemAsset } from "../server/item/adapter/item-asset.ts"
import {
  createReportImageShelf,
  type ReportImageShelf,
} from "../server/report/core/image/report-image-shelf.ts"
import { createBeadsStampReader } from "../server/repository/adapter/beads/beads.ts"
import { readHeadSha } from "../server/repository/adapter/change-count.ts"
import {
  createPromptImageShelf,
  type PromptImageShelf,
} from "../server/session-driver/core/prompt-image-shelf.ts"
import { createOpenTaskReader, twClaimsRunner } from "../server/usage/adapter/tw-claim-list.ts"
import type { SwallowedFailurePlace } from "../shared/diagnostic/swallowed-failure.ts"
import { wireAchievement } from "./achievement.ts"
import { createCurrentCharacter, type CurrentCharacter } from "./current-character.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import { createHost } from "./host.ts"
import { wireRepository } from "./repository.ts"
import { wireSessionClaim } from "./session-claim.ts"
import { type StartedSession, startSession } from "./session-start.ts"
import type { StartupPrerequisites } from "./startup-prerequisite.ts"
import { type WiredUsageLogs, wireTokenUsage, wireUsageLogs } from "./usage.ts"
import { startViewDelivery, type ViewDeliveryOptions } from "./view-delivery.ts"
import type { WiringContext } from "./wiring-context.ts"
import { wireWorkflowSetting } from "./workflow-setting.ts"

export type StartupAssembly = {
  readonly context: WiringContext
  readonly usageLogs: WiredUsageLogs
  readonly reportFailure: (place: SwallowedFailurePlace, error: unknown) => void
  readonly pruneExpiredChatImages: () => void
  readonly character: CurrentCharacter
  readonly promptImageShelf: PromptImageShelf
  readonly reportImageShelf: ReportImageShelf
  readonly host: Host
  readonly achievement: ReturnType<typeof wireAchievement>
  readonly repository: ReturnType<typeof wireRepository>
  readonly workflowSetting: ReturnType<typeof wireWorkflowSetting>
  /** 各機能の組み立てが返した `/rpc` の読み口を束ねたもの。 */
  readonly rpc: ViewDeliveryOptions["rpc"]
  readonly headSha: ReturnType<typeof readHeadSha>
}

/** 両側が共有する入れ物を組み立てる。雑談の画像を日の始まりごとに消すタイマーもここで仕掛ける。 */
export function assembleStartup(
  config: Config,
  cwd: string,
  prerequisites: StartupPrerequisites,
): StartupAssembly {
  const { driver, plugins } = prerequisites
  // 置き場（`~/.tsukumo/` の下）を知っているところを増やさない。
  const usageLogs = wireUsageLogs(
    { driver },
    { openTask: createOpenTaskReader(twClaimsRunner(plugins.workflowTw, cwd)) },
  )
  const clock = createServerClock(config.fixedClock)
  const reportFailure = failureDiagnostic(usageLogs.diagnostic, clock)
  const pruneExpiredChatImages = (): void => {
    pruneChatImages(todayLocalDateKey(clock), (error) => {
      reportFailure({ feature: "chat", place: "archive-image-prune" }, error)
    })
  }
  repeatAtEachLocalDayStart(pruneExpiredChatImages, clock)

  const character = createCurrentCharacter(config, cwd, (place, error) => {
    reportFailure({ feature: "chat", place }, error)
  })
  const promptImageShelf = createPromptImageShelf(() => crypto.randomUUID())
  const reportImageShelf = createReportImageShelf()
  const host = createHost(config.host)

  // 成果の画面が Beads の読みを覚える入れ物も1つ（温めはセッション側が起こす）。
  // 印の読み手も1つで、成果のキャッシュとタスク一覧の見張りが同じものを使う（同時の読みは束ねられる）。
  const readBeadsStamp = createBeadsStampReader(cwd)
  const achievementCache = createAchievementCache(cwd, clock, readBeadsStamp)
  const workflowSetting = wireWorkflowSetting(cwd, plugins.workflowTw)
  const context: WiringContext = {
    cwd,
    now: clock,
    inheritedEnv: config.inheritedEnv,
    driver,
    chatArchive: createChatArchive(),
    throwawayQuery: usageLogs.throwawayQuery.record,
  }
  const achievement = wireAchievement(context, achievementCache, usageLogs.diagnostic)
  const repository = wireRepository(context, usageLogs.diagnostic, readBeadsStamp)
  const tokenUsage = wireTokenUsage(context, usageLogs.tokenUsage)
  const sessionClaim = wireSessionClaim()

  return {
    context,
    usageLogs,
    reportFailure,
    pruneExpiredChatImages,
    character,
    promptImageShelf,
    reportImageShelf,
    host,
    achievement,
    repository,
    workflowSetting,
    rpc: {
      ...repository.rpc,
      ...tokenUsage.rpc,
      ...sessionClaim.rpc,
      ...achievement.rpc,
      ...workflowSetting.rpc,
    },
    headSha: readHeadSha(cwd),
  }
}

/**
 * ビューを配り始め、配れたらセッションを起こして繋ぐ。
 * 先に配れることを確かめてから起こすので、ポートが取れずに終わるときに claude の子プロセスを残さない。
 */
export async function startViewAndSession(
  config: Config,
  assembly: StartupAssembly,
  prerequisites: StartupPrerequisites,
  devServer: boolean,
): Promise<
  | {
      readonly kind: "ok"
      readonly url: string
      readonly port: number
      readonly session: StartedSession
    }
  | { readonly kind: "failed"; readonly reason: string }
> {
  const view = await startViewDelivery({
    portResolution: prerequisites.portResolution,
    rpc: assembly.rpc,
    bundle: prerequisites.bundle,
    character: assembly.character,
    serveItemAsset: (fileName, version) => readItemAsset(fileName, version),
    promptImageShelf: assembly.promptImageShelf,
    reportImageShelf: assembly.reportImageShelf,
    diagnosticLog: assembly.usageLogs.diagnostic,
    now: assembly.context.now,
    devServer,
  })
  if (view.kind === "failed") {
    return view
  }

  // セッションの印の目印は、実際に待ち受けているポートから決まる（`sessionTag`）。
  // 同じディレクトリで2つめを起こすとポートがずれるので、目印も分かれる。
  // 設定のポートではなく `view.port` を渡すこと。
  const session = await startSession({
    config,
    character: assembly.character,
    context: assembly.context,
    achievement: assembly.achievement,
    repository: assembly.repository,
    usageLogs: assembly.usageLogs,
    promptImageShelf: assembly.promptImageShelf,
    reportImageShelf: assembly.reportImageShelf,
    viewPort: view.port,
    host: assembly.host,
    plugins: prerequisites.plugins,
    workflowSetting: assembly.workflowSetting.commands,
  })
  view.connect(session)
  return { kind: "ok", url: view.url, port: view.port, session }
}

/**
 * 次のローカルの日の始まりごとに `task` を呼ぶ。タイマーはプロセスを生かし続けない。
 * 境目の直前に起きて同じ日のまま呼ばないよう、少し遅らせて起きる。
 * 起きても `now` が進んでいない（凍らせた時計）なら次を仕掛けない。境目の直前で凍っていると短い間隔で回り続けるため。
 */
function repeatAtEachLocalDayStart(task: () => void, now: () => number): void {
  const armedAt = now()
  const timer = setTimeout(
    () => {
      task()
      if (now() !== armedAt) {
        repeatAtEachLocalDayStart(task, now)
      }
    },
    millisecondsUntilNextLocalDay(now) + DAY_START_MARGIN_MS,
  )
  timer.unref()
}

/** 日の境目から起きるまでの遅れ。 */
const DAY_START_MARGIN_MS = 1_000
