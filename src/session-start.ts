// セッションを1つ起こす配線。
// 機能ごとの組み立て（`src/wiring/`）を並べ、`createSessionManager` と `createSocketRouter` へ結ぶ。

import { basename, dirname } from "node:path"

import type { CurrentCharacter } from "./current-character.ts"
import { createSocketRouter } from "./router.ts"
import { createAchievementCommitCache } from "./server/achievement/adapter/main-history.ts"
import { createServerClock } from "./server/adapter/local-time.ts"
import { createChatArchive } from "./server/chat/adapter/chat-archive.ts"
import { createContextUsageLog } from "./server/context-usage/adapter/context-usage-log.ts"
import type { Config } from "./server/core/config.ts"
import { createExperienceMetricLog } from "./server/experience-metric/adapter/experience-metric-log.ts"
import { readReportImageFile } from "./server/report/adapter/report-image-file.ts"
import { createReportUsageLog } from "./server/report/adapter/report-usage-log.ts"
import type { ReportImageShelf } from "./server/report/core/report-image-shelf.ts"
import { runGit } from "./server/repository/adapter/git.ts"
import type { FakeSession } from "./server/session-driver/adapter/fake-driver.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import { EVENT_BATCH_INTERVAL_MS } from "./server/session/core/event-batch.ts"
import { createSessionManager, type SessionManager } from "./server/session/core/session-manager.ts"
import type { TokenUsageLog } from "./server/token-usage/core/token-usage.ts"
import type { SocketRouter } from "./server/view-server/adapter/session-socket.ts"
import { wireAchievement } from "./wiring/achievement.ts"
import { wireCharacterPack } from "./wiring/character-pack.ts"
import { wireChat } from "./wiring/chat.ts"
import { wireDiary } from "./wiring/diary.ts"
import { wireHost } from "./wiring/host.ts"
import { wireRepository } from "./wiring/repository.ts"
import { wireSessionLaunch } from "./wiring/session-launch.ts"
import { wireUsageReview } from "./wiring/usage-review.ts"
import { wireVisit } from "./wiring/visit.ts"
import type { WiringContext } from "./wiring/wiring-context.ts"

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /** fake driver の疑似セッション（`TSUKUMO_DRIVER=fake` のときだけ）。あるときは claude を起こさない。 */
  readonly fakeSession: FakeSession | undefined
  readonly tokenUsageLog: TokenUsageLog
  /** 依頼に添えた画像の原寸の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly promptImageShelf: PromptImageShelf
  /** `image` の塊の画像の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly reportImageShelf: ReportImageShelf
  /** ビューが実際に待ち受けているポート。セッションの印の目印がここから決まる（`sessionTag`）。 */
  readonly viewPort: number
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
}

/** 起こしたセッションと、開いたタブがそれを触るコマンドの手続き。 */
export type StartedSession = {
  readonly manager: SessionManager
  /** `/ws` に載せるルータ。書き込み口の中身はここで選んで渡す。 */
  readonly socketRouter: SocketRouter
}

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export async function startSession(options: SessionStartOptions): Promise<StartedSession> {
  const { config, character, promptImageShelf } = options
  const context: WiringContext = {
    cwd: options.cwd,
    // サーバの時計は1つ（`TSUKUMO_FIXED_CLOCK` なら止まった時計）。
    now: createServerClock(config.fixedClock),
    inheritedEnv: config.inheritedEnv,
    fakeSession: options.fakeSession,
    chatArchive: createChatArchive(),
    achievementCommitCache: createAchievementCommitCache(),
  }
  // 最初のタブが繋がったら解ける約束。
  const firstViewer = Promise.withResolvers<void>()

  const diary = wireDiary(context)
  const launch = wireSessionLaunch({
    context,
    config,
    character,
    viewPort: options.viewPort,
    firstViewer: firstViewer.promise,
    onLaunch: diary.noteLaunched,
  })
  const chat = wireChat(context, character)
  const visit = wireVisit(context, config.quickVisit)
  const usageReview = wireUsageReview()
  const repository = wireRepository(context)
  const achievement = wireAchievement(context)
  const host = wireHost(context)
  const characterPack = wireCharacterPack(character)

  const manager = createSessionManager({
    // 時刻はエポックミリ秒の数のまま渡す（`Temporal.Instant` にしない）。
    // 両側で回す畳み込みが比較と引き算にしか使わず、数なら偽の時計も数で済む。
    now: context.now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    chatArchive: context.chatArchive,
    // 会話のアーカイブに仕事の行として書く `project`。起動時に1回だけ取る。
    project: await resolveArchiveProjectName(context.cwd),
    tokenUsageLog: options.tokenUsageLog,
    contextUsageLog: createContextUsageLog(),
    experienceMetricLog: createExperienceMetricLog(),
    reportUsageLog: createReportUsageLog(),
    promptImageShelf,
    reportImageShelf: options.reportImageShelf,
    readReportImage: (path) => readReportImageFile(context.cwd, path),
    ...launch.manager,
    ...chat.manager,
    ...visit.manager,
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
    chat: chat.commands,
    visit: visit.commands,
    usageReview: usageReview.commands,
    host: host.commands,
  })
  return {
    manager: {
      ...manager,
      subscribe: (send) => {
        const unsubscribe = manager.subscribe(send)
        firstViewer.resolve()
        return unsubscribe
      },
    },
    socketRouter,
  }
}

/**
 * 会話のアーカイブの `project`（`docs/architecture/chat-mode.md`「雑談の会話のアーカイブ」）を取る。
 * 共有の `.git` の親ディレクトリの名前で、`git` が無い・リポジトリでないときは `cwd` の最後の名前
 * （ハッシュは付けず、取れないときも諦めずに `cwd` へ落ちる）。
 */
async function resolveArchiveProjectName(cwd: string): Promise<string> {
  const result = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  const gitDir = result.kind === "output" ? result.stdout.trim() : ""
  return gitDir === "" ? basename(cwd) : basename(dirname(gitDir))
}
