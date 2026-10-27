// セッションを1つ起こす配線。
// 機能ごとの組み立て（`src/wiring/`）を並べ、`createSessionManager` と `createSocketRouter` へ結ぶ。

import { basename, dirname } from "node:path"

import type { CurrentCharacter } from "./current-character.ts"
import { createSocketRouter } from "./router.ts"
import type { Config } from "./server/core/config.ts"
import type { Host } from "./server/host/core/host.ts"
import { readReportImageFile } from "./server/report/adapter/report-image-file.ts"
import type { ReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import { runGit } from "./server/repository/adapter/git.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import { EVENT_BATCH_INTERVAL_MS } from "./server/session/core/event-batch.ts"
import type { SessionManager } from "./server/session/core/session-manager-port.ts"
import { createSessionManager } from "./server/session/core/session-manager.ts"
import type { SocketRouter } from "./server/view-server/adapter/session-socket.ts"
import type { WorkflowSettingProcedurePorts } from "./server/workflow-setting/adapter/workflow-setting-procedure.ts"
import type { wireAchievement } from "./wiring/achievement.ts"
import { wireCharacterPack } from "./wiring/character-pack.ts"
import { wireChat } from "./wiring/chat.ts"
import { wireDiagnostic } from "./wiring/diagnostic.ts"
import { wireDiary } from "./wiring/diary.ts"
import { wireHost } from "./wiring/host.ts"
import { wireItem } from "./wiring/item.ts"
import type { wireRepository } from "./wiring/repository.ts"
import { wireSessionLaunch } from "./wiring/session-launch.ts"
import { type WiredUsageLogs, wireUsageReview } from "./wiring/usage.ts"
import { wireWelcomeGreeting } from "./wiring/welcome-greeting.ts"
import type { WiringContext } from "./wiring/wiring-context.ts"

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  readonly context: WiringContext
  readonly achievement: ReturnType<typeof wireAchievement>
  readonly repository: ReturnType<typeof wireRepository>
  /** 日付ごとの記録の口。ビューの配信が引く token-usage・diagnostic と同じものを渡す（`wireUsageLogs`）。 */
  readonly usageLogs: WiredUsageLogs
  /** 依頼に添えた画像の原寸の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly promptImageShelf: PromptImageShelf
  /** `image` の塊の画像の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly reportImageShelf: ReportImageShelf
  /** ビューが実際に待ち受けているポート。セッションの印の目印がここから決まる（`sessionTag`）。 */
  readonly viewPort: number
  /** レポートのパスを開くホスト。 */
  readonly host: Host
  /** 取り込んだ tsukumo-plugins をセッションに載せるか。利用者が同じものを入れていれば載せない。 */
  readonly mountWorkflowPlugin: boolean
  /** 取り込んだ図のプラグインをセッションに載せるか。利用者が同じスキルを入れていれば載せない。 */
  readonly mountFigurePlugin: boolean
  /** ワークフローの `tw` のパス（`chooseTw`）。hook の `lap-hook`・`ask-guard` を起こす。 */
  readonly workflowTw: string
  /** ワークフローの設定を書く口（`wireWorkflowSetting`）。 */
  readonly workflowSetting: Pick<WorkflowSettingProcedurePorts, "changeWorkflowSetting">
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
  const { config, character, promptImageShelf, usageLogs, context } = options
  const diagnosticLog = usageLogs.diagnostic
  const archiveProject = resolveArchiveProjectName(context.cwd)
  // 成果の画面を初めて開く前に `bd list` を済ませておく（読みは覚えられ、同時の読みは束ねられる）。
  // 待たない。起動の流れはこの読みを待たずに進む。
  options.achievement.warmUp()
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
    mountFigurePlugin: options.mountFigurePlugin,
    workflowTw: options.workflowTw,
    firstViewer: firstViewer.promise,
    diagnosticLog,
    onLaunch: (seed, onEvent, restored) => {
      diary.noteLaunched(seed)
      usageReview.noteLaunched(seed)
      return welcomeGreeting.noteLaunched(seed, onEvent, restored)
    },
  })
  const chat = wireChat(context, character)
  const { repository } = options
  const { achievement } = options
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
    diagnostic: wireDiagnostic(context, diagnosticLog).commands,
    experienceMetric: { recordSplit: manager.recordSplit },
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
