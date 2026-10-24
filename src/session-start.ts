// セッションを1つ起こす配線。
// 機能ごとの組み立て（`src/wiring/`）を並べ、`createSessionManager` と `createSocketRouter` へ結ぶ。

import { basename, dirname } from "node:path"

import type { CurrentCharacter } from "./current-character.ts"
import { createSocketRouter } from "./router.ts"
import type { AchievementCache } from "./server/achievement/adapter/closed-issue.ts"
import { createServerClock } from "./server/adapter/local-time.ts"
import { createChatArchive } from "./server/chat/adapter/chat-archive.ts"
import type { Config } from "./server/core/config.ts"
import type { Host } from "./server/host/core/host.ts"
import { readReportImageFile } from "./server/report/adapter/report-image-file.ts"
import { warmUpMermaidChecker } from "./server/report/adapter/report-mermaid-syntax.ts"
import type { ReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import type { BeadsStamp } from "./server/repository/adapter/beads.ts"
import { runGit } from "./server/repository/adapter/git.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import { EVENT_BATCH_INTERVAL_MS } from "./server/session/core/event-batch.ts"
import type { SessionManager } from "./server/session/core/session-manager-port.ts"
import { createSessionManager } from "./server/session/core/session-manager.ts"
import type { SocketRouter } from "./server/view-server/adapter/session-socket.ts"
import type { WorkflowSettingProcedurePorts } from "./server/workflow-setting/adapter/workflow-setting-procedure.ts"
import { wireAchievement } from "./wiring/achievement.ts"
import { wireCharacterPack } from "./wiring/character-pack.ts"
import { wireChat } from "./wiring/chat.ts"
import { wireDiary } from "./wiring/diary.ts"
import { wireHost } from "./wiring/host.ts"
import { wireItem } from "./wiring/item.ts"
import { wireRepository } from "./wiring/repository.ts"
import { wireSessionLaunch } from "./wiring/session-launch.ts"
import type { WiredUsageLogs } from "./wiring/usage-log.ts"
import { wireUsageReview } from "./wiring/usage-review.ts"
import { wireWelcomeGreeting } from "./wiring/welcome-greeting.ts"
import type { WiringContext, WiringDriver } from "./wiring/wiring-context.ts"

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /** 駆動の種類。`fake`（`TSUKUMO_DRIVER=fake`）は疑似セッションを持ち、claude を起こさない。 */
  readonly driver: WiringDriver
  /** 日付ごとの記録の口。ビューの配信が引く token-usage・diagnostic と同じものを渡す（`wireUsageLogs`）。 */
  readonly usageLogs: WiredUsageLogs
  /** 成果の画面が Beads の読みを覚える入れ物。ビューの配信が引くものと同じ1つを渡す。 */
  readonly achievementCache: AchievementCache
  readonly readBeadsStamp: () => Promise<BeadsStamp>
  /** 依頼に添えた画像の原寸の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly promptImageShelf: PromptImageShelf
  /** `image` の塊の画像の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly reportImageShelf: ReportImageShelf
  /** ビューが実際に待ち受けているポート。セッションの印の目印がここから決まる（`sessionTag`）。 */
  readonly viewPort: number
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
  /** レポートのパスを開くホスト。 */
  readonly host: Host
  /** 取り込んだ tsukumo-plugins をセッションに載せるか。利用者が同じものを入れていれば載せない。 */
  readonly mountWorkflowPlugin: boolean
  /** ワークフローの設定を読み書きする口。ビューの配信が読む口と同じ1つを渡す（`wireWorkflowSetting`）。 */
  readonly workflowSetting: WorkflowSettingProcedurePorts
}

/** 起こしたセッションと、開いたタブがそれを触るコマンドの手続き。 */
export type StartedSession = {
  readonly manager: SessionManager
  /** `/ws` に載せるルータ。書き込み口の中身はここで選んで渡す。 */
  readonly socketRouter: SocketRouter
  /** ここで作った追記の口を閉じ、書き残しがファイルに渡るのを待つ。プロセスを終える前に待つ。 */
  readonly closeLogs: () => Promise<void>
}

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export async function startSession(options: SessionStartOptions): Promise<StartedSession> {
  const { config, character, promptImageShelf, usageLogs } = options
  const diagnosticLog = usageLogs.diagnostic
  const archiveProject = resolveArchiveProjectName(options.cwd)
  const context: WiringContext = {
    cwd: options.cwd,
    // サーバの時計は1つ（`TSUKUMO_FIXED_CLOCK` なら止まった時計）。
    now: createServerClock(config.fixedClock),
    inheritedEnv: config.inheritedEnv,
    driver: options.driver,
    chatArchive: createChatArchive(),
    achievementCache: options.achievementCache,
    readBeadsStamp: options.readBeadsStamp,
  }
  // 成果の画面を初めて開く前に `bd list` を済ませておく（読みは覚えられ、同時の読みは束ねられる）。
  // 待たない。起動の流れはこの読みを待たずに進む。
  void context.achievementCache.readBeads()
  // 最初のタブが繋がったら解ける約束。
  const firstViewer = Promise.withResolvers<void>()

  const diary = wireDiary(context)
  const welcomeGreeting = wireWelcomeGreeting(context, diagnosticLog)
  const usageReview = wireUsageReview(context, options.mountWorkflowPlugin)
  const item = wireItem(context)
  const launch = wireSessionLaunch({
    context,
    config,
    character,
    itemsEvent: item.itemsEvent,
    viewPort: options.viewPort,
    mountWorkflowPlugin: options.mountWorkflowPlugin,
    firstViewer: firstViewer.promise,
    diagnosticLog,
    onLaunch: (seed, onEvent, restored) => {
      diary.noteLaunched(seed)
      usageReview.noteLaunched(seed)
      return welcomeGreeting.noteLaunched(seed, onEvent, restored)
    },
  })
  const chat = wireChat(context, character)
  const repository = wireRepository(context, diagnosticLog)
  const achievement = wireAchievement(context)
  const host = wireHost(context, options.host)
  const characterPack = wireCharacterPack(context, character, diagnosticLog)

  const project = await archiveProject
  const manager = createSessionManager({
    // 時刻はエポックミリ秒の数のまま渡す（`Temporal.Instant` にしない）。
    // 両側で回す畳み込みが比較と引き算にしか使わず、数なら偽の時計も数で済む。
    now: context.now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    chatArchive: context.chatArchive,
    // 会話のアーカイブに仕事の行として書く `project`。起動時に1回だけ取る。
    project,
    tokenUsageLog: usageLogs.tokenUsage,
    contextUsageLog: usageLogs.context,
    experienceMetricLog: usageLogs.experienceMetric,
    diagnosticLog,
    reportUsageLog: usageLogs.report,
    promptImageShelf,
    reportImageShelf: options.reportImageShelf,
    readReportImage: (path, notModifiedAfter) =>
      readReportImageFile(context.cwd, path, notModifiedAfter),
    ...launch.manager,
    ...chat.manager,
    ...usageReview.manager,
    ...repository.manager,
  })
  switch (context.driver.kind) {
    case "sdk":
      setImmediate(warmUpMermaidChecker)
      break
    case "fake":
      break
    default:
      context.driver satisfies never
  }
  const socketRouter = createSocketRouter({
    session: {
      promptImageShelf,
      ...launch.sessionCommands,
      ...achievement.sessionCommands,
      ...diary.sessionCommands,
    },
    characterPack: characterPack.commands,
    item: item.commands,
    chat: chat.commands,
    usageReview: usageReview.commands,
    host: host.commands,
    workflowSetting: options.workflowSetting,
  })
  return {
    manager: {
      ...manager,
      close: () => {
        manager.close()
        usageReview.close()
        launch.releaseSessionClaim()
      },
      subscribe: (send) => {
        const unsubscribe = manager.subscribe(send)
        firstViewer.resolve()
        return unsubscribe
      },
    },
    socketRouter,
    closeLogs: usageLogs.closeAll,
  }
}

/**
 * 会話のアーカイブの `project`（`docs/architecture/chat-mode.md`「会話のアーカイブ」）を取る。
 * 共有の `.git` の親ディレクトリの名前で、`git` が無い・リポジトリでないときは `cwd` の最後の名前
 * （ハッシュは付けず、取れないときも諦めずに `cwd` へ落ちる）。
 */
async function resolveArchiveProjectName(cwd: string): Promise<string> {
  const result = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  const gitDir = result.kind === "output" ? result.stdout.trim() : ""
  return gitDir === "" ? basename(cwd) : basename(dirname(gitDir))
}
