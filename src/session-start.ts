// セッションを1つ起こす配線。
// どの駆動で起こすか（本物の SDK か疑似セッションの fake driver か）と、続きから始めるセッションをどう探すかをここで決める。
// 起こす順序そのものは `createSessionLaunch` に任せる（起動時も起こし直しも同じ関数を通る）。

import { basename, dirname } from "node:path"
import process from "node:process"

import type { CurrentCharacter } from "./current-character.ts"
import { createSocketRouter } from "./router.ts"
import {
  type AchievementCommitCache,
  createAchievementCommitCache,
  readAchievement,
} from "./server/achievement/adapter/main-history.ts"
import { createServerClock, localTimeHHMM, todayLocalDateKey } from "./server/adapter/local-time.ts"
import {
  type CharacterPack,
  listCharacterPacks,
} from "./server/character-pack/adapter/character-pack.ts"
import { createChatArchive } from "./server/chat/adapter/chat-archive.ts"
import { createChatSummary } from "./server/chat/adapter/chat-summary.ts"
import { createPersonaMemory, readRememberedLines } from "./server/chat/adapter/persona-memory.ts"
import { queryChatConsolidation } from "./server/chat/adapter/sdk-chat-consolidation.ts"
import {
  type ChatConsolidationSource,
  createChatConsolidationWriter,
} from "./server/chat/core/chat-consolidation-writer.ts"
import { readChatTopics } from "./server/chat/core/chat-consolidation.ts"
import { createChatRecall } from "./server/chat/core/chat-recall.ts"
import { createContextUsageLog } from "./server/context-usage/adapter/context-usage-log.ts"
import type { Config } from "./server/core/config.ts"
import { appendDiaryParagraph } from "./server/diary/adapter/diary.ts"
import { queryDiary } from "./server/diary/adapter/sdk-diary.ts"
import {
  createDiaryWriter,
  type DiaryWriterContext,
  type DiaryWriterSource,
} from "./server/diary/core/diary-writer.ts"
import { createOrcaHost } from "./server/host/adapter/orca-host.ts"
import { openTrackedFile } from "./server/host/core/tracked-file.ts"
import { createReportUsageLog } from "./server/report/adapter/report-usage-log.ts"
import { runGit } from "./server/repository/adapter/git.ts"
import { listRepositoryFiles } from "./server/repository/adapter/repository-file.ts"
import { watchTaskSummary } from "./server/repository/adapter/task-summary.ts"
import { type FakeSession, startFakeSession } from "./server/session-driver/adapter/fake-driver.ts"
import { startSdkDriver } from "./server/session-driver/adapter/sdk-driver.ts"
import {
  listRepositorySessions,
  readRestoredEvents,
} from "./server/session-driver/adapter/sdk-session.ts"
import type { PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import {
  createSessionCatalog,
  EMPTY_SESSION_CATALOG,
  type SessionCatalog,
} from "./server/session-driver/core/session-catalog.ts"
import type {
  ChatArchive,
  SessionDriver,
  SessionMode,
  SessionStart,
} from "./server/session-driver/core/session-driver.ts"
import { canResume, sessionTag } from "./server/session-driver/core/session-restore.ts"
import {
  readRememberedSessionDefault,
  readRememberedVisitEnabled,
  writeRememberedSessionDefault,
  writeRememberedVisitEnabled,
} from "./server/session/adapter/remembered-default.ts"
import { EVENT_BATCH_INTERVAL_MS } from "./server/session/core/event-batch.ts"
import {
  createSessionLaunch,
  type SessionLaunchSeed,
} from "./server/session/core/session-launch.ts"
import { createSessionManager, type SessionManager } from "./server/session/core/session-manager.ts"
import {
  takeSystemPromptAppend,
  toSystemPromptMode,
} from "./server/system-prompt/core/system-prompt.ts"
import type { TokenUsageLog } from "./server/token-usage/core/token-usage.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "./server/usage-review/adapter/previous-usage-review.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "./server/usage-review/adapter/usage-proposal-dismissal.ts"
import type { SocketRouter } from "./server/view-server/adapter/session-socket.ts"
import { queryVisitScript } from "./server/visit/adapter/sdk-visit-script.ts"
import { createVisitClock } from "./server/visit/adapter/visit-clock.ts"
import { visitGuests } from "./server/visit/core/visit-guest.ts"
import {
  createVisitScriptWriter,
  type VisitScriptSource,
} from "./server/visit/core/visit-script-writer.ts"
import { visitCast } from "./server/visit/core/visit-script.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "./server/visit/core/visit-timing.ts"
import { UNKNOWN_ACHIEVEMENT } from "./shared/achievement/achievement.ts"
import { expressionChoices } from "./shared/character-pack/expression-choice.ts"
import type { UsageProposalDismissal } from "./shared/contract/usage-review.ts"
import type { SessionDefault } from "./shared/session/session-default.ts"
import type { SessionEvent } from "./shared/session/session-event.ts"
import { usageProposalKey, withoutDismissedProposals } from "./shared/usage-review/usage-review.ts"

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /** fake driver の疑似セッション（`TSUKUMO_DRIVER=fake` のときだけ）。あるときは claude を起こさない。 */
  readonly fakeSession: FakeSession | undefined
  readonly tokenUsageLog: TokenUsageLog
  /** 依頼に添えた画像の原寸の棚。ビューの配信が引く棚と同じ1つを渡す。 */
  readonly promptImageShelf: PromptImageShelf
  /**
   * ビューが実際に待ち受けているポート。セッションの印の目印がここから決まる（`sessionTag`）。
   * 同じディレクトリで2つめを起こすとポートがずれ、目印も分かれるので、互いのセッションを取り合わない。
   */
  readonly viewPort: number
}

/** 起こしたセッションと、開いたタブがそれを触るコマンドの手続き。 */
export type StartedSession = {
  readonly manager: SessionManager
  /** `/ws` に載せるルータ。書き込み口の中身はここで選んで渡す。 */
  readonly socketRouter: SocketRouter
}

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export async function startSession(options: SessionStartOptions): Promise<StartedSession> {
  const { config, character, fakeSession, tokenUsageLog, promptImageShelf, viewPort } = options
  // claude の作業先は tsukumo を起こしたディレクトリ（作業ツリーを分けるのは orca の側）。
  const cwd = process.cwd()
  // 会話のアーカイブに仕事の行として書く `project`。起動時に1回だけ取る。
  const project = await resolveArchiveProjectName(cwd)
  // 会話のアーカイブの口は1つを、書く側（セッションの管理）と読む側（起こすとき）で共有する。
  const chatArchive = createChatArchive()
  const contextUsageLog = createContextUsageLog()
  const reportUsageLog = createReportUsageLog()
  // レポートのパスを開く先。`createOrcaHost()` は状態を持たないので、起動の段取りとは別にここでも1つ作ってよい。
  const host = createOrcaHost()
  // 成果の振り返り（`session.reflectAchievement`）と訪問の台本がその日の成果を数え直すための入れ物。
  // ビューの配信が持つものとは別の1つで、同じ日を両方から数えても結果は変わらない。
  const achievementCommitCache = createAchievementCommitCache()
  // 振り返りの書き手が読む、直近に起こした代のパック情報。
  // `startDriver` を呼ぶたびに更新する（キャラクターを切り替えたあとの振り返りは、切り替えたあとのパックで書く）。
  let diaryContext: DiaryWriterContext | undefined = undefined
  // サーバの時計は1つ（`TSUKUMO_FIXED_CLOCK` なら止まった時計）。
  const now = createServerClock(config.fixedClock)
  // 印の付いたセッションの一覧。ここで1回読み始め、起こし直しはメモリの一覧から続きを選ぶ。
  // 続きを探さない起こし方なら何も読まない。
  const sessionCatalog = canResume(config)
    ? createSessionCatalog({ read: () => listRepositorySessions(cwd), now })
    : EMPTY_SESSION_CATALOG
  // 最初のタブが繋がったら解ける約束。fake driver は疑似セッションをここから流し始める。本物の駆動は待たない。
  const firstViewer = Promise.withResolvers<void>()
  const manager = createSessionManager({
    // 時刻はエポックミリ秒の数のまま渡す（`Temporal.Instant` にしない）。
    // 両側で回す畳み込みが比較と引き算にしか使わず、数なら偽の時計も数で済む。
    now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    chatArchive,
    project,
    // 疑似セッションでは claude を起こさないので、定着は走らせない。
    chatConsolidation:
      fakeSession === undefined
        ? chatConsolidationSource(chatArchive, cwd, config.inheritedEnv)
        : { kind: "dont-consolidate" },
    tokenUsageLog,
    contextUsageLog,
    reportUsageLog,
    promptImageShelf,
    launchSession: createSessionLaunch<CharacterPack>({
      choosePack: (selection) => character.choose(selection),
      rememberPack: (pack) => character.remember(pack),
      // 覚えた既定は起こすたびに読む（歯車で書き換えたあと、起こし直しで効く）。
      readSessionDefault: () => readRememberedSessionDefault(),
      // 覚えた「訪問」のオン・オフも起こすたびに読む。
      // ここで読むのは「起こした直後の初期値」だけで、`visit.setEnabled` はこれとは別にいま動いているセッションにも即座に効く。
      readVisitEnabled: () => readRememberedVisitEnabled(),
      characterEvent: () => character.event(),
      readChatTopics: (pack) => readChatTopics(createChatSummary(pack.name)),
      readRememberedLines: (pack) => readRememberedLines(pack),
      findResumeSession: (pack, chat) =>
        findPackSessionToResume(sessionCatalog, pack.name, chat, viewPort),
      listSessions: (pack, chat) =>
        sessionCatalog.listChoices(sessionTag(pack.name, chat, viewPort)),
      refreshSessions: () => sessionCatalog.refresh(),
      startDriver: (seed, onEvent) => {
        // 書いた時点のパックとして、振り返りの書き手が読む直近の姿を更新する。
        diaryContext = {
          persona: seed.pack.persona ?? "",
          expressions: expressionChoices(seed.pack.definition),
          writer: { pack: seed.pack.name, name: seed.pack.definition?.name ?? seed.pack.name },
          cwd,
          env: config.inheritedEnv,
        }
        return startDriver({
          seed,
          chatArchive,
          fakeSession,
          scene: config.fakeScene,
          firstViewer: firstViewer.promise,
          viewPort,
          cwd,
          inheritedEnv: config.inheritedEnv,
          onSessionMarked: (sessionId, tag) => sessionCatalog.noteMarked(sessionId, tag),
          onEvent,
          now,
        })
      },
      restoreEvents: (resumed, pack) =>
        readRestoredEvents(resumed, expressionChoices(pack.definition)),
    }),
    // 前回の見直しの結果は、読むときに見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
    readPreviousUsageReview: () =>
      withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
    writePreviousUsageReview,
    watchTasks: (onEvent) =>
      watchTaskSummary(cwd, (tasks) => onEvent({ kind: "tasks-changed", tasks })),
    // 客の候補は来るときにパックの一覧を読み直して拾う（画面から作った・直したパックもその場で効く）。
    visit: {
      timing: config.quickVisit ? QUICK_VISIT_TIMING : VISIT_TIMING,
      clock: createVisitClock(),
      listGuests: () => visitGuests(listCharacterPacks(cwd)),
      random: Math.random,
      // 台本はその場で作る。疑似セッションでは claude を起こさないので、パックの台本だけ。
      scriptSource:
        fakeSession === undefined
          ? visitScriptSource(cwd, config.inheritedEnv, achievementCommitCache, now)
          : { kind: "pack-only" },
    },
  })
  const socketRouter = createSocketRouter({
    session: {
      promptImageShelf,
      // 歯車から届いた既定は、覚えてから画面へ流し直すだけ（いまのセッションには効かない）。
      rememberSessionDefault: (sessionDefault) => rememberSessionDefault(sessionDefault),
      // 読めなかった・`main` が読めない日は `undefined` に畳み、断る理由はコマンドの受け手が決める。
      readAchievementDay: async (date) => {
        const result = await readAchievement(cwd, date, todayLocalDateKey(), achievementCommitCache)
        return result.kind === "ok" ? result.achievement : undefined
      },
      // 疑似セッションでは振り返りの書き手を起こさない。
      diary:
        fakeSession === undefined
          ? diaryWriterSource(cwd, () => diaryContext, now)
          : { kind: "dont-write" },
    },
    characterPack: {
      editCharacter: (edit) => Promise.resolve(character.applyEdit(edit)),
      createCharacter: (create) => Promise.resolve(character.applyCreate(create)),
      deleteCharacter: (remove) => Promise.resolve(character.applyDelete(remove)),
    },
    chat: {
      forgetRememberedLine: (line) => Promise.resolve(character.forgetRememberedLine(line)),
    },
    // 歯車から届いた「訪問」のオン・オフは、覚えてから画面へ流し直す。こちらはいま動いているセッションにも即座に効く。
    visit: { rememberVisitEnabled: (visitEnabled) => rememberVisitEnabled(visitEnabled) },
    usageReview: { dismissUsageProposal: (dismiss) => dismissUsageProposal(dismiss) },
    host: {
      openFile: (path) =>
        openTrackedFile(
          path,
          () => listRepositoryFiles(cwd),
          (tracked) => host.openFile(tracked),
        ),
    },
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
 * （日記の `<リポジトリ>` と同じ取り方だが、ハッシュは付けず、取れないときも諦めずに `cwd` へ落ちる）。
 */
async function resolveArchiveProjectName(cwd: string): Promise<string> {
  const result = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  const gitDir = result.kind === "output" ? result.stdout.trim() : ""
  return gitDir === "" ? basename(cwd) : basename(dirname(gitDir))
}

/**
 * 振り返りの書き手の出どころ。
 * 書く時点のパックは `readContext` で毎回読み直す。
 * `cwd` はリポジトリの見分けに使う（{@link appendDiaryParagraph}）。
 */
function diaryWriterSource(
  cwd: string,
  readContext: () => DiaryWriterContext | undefined,
  now: () => number,
): DiaryWriterSource {
  return {
    kind: "write",
    write: createDiaryWriter({
      now,
      save: (paragraph) => appendDiaryParagraph(cwd, paragraph),
      readContext,
      query: queryDiary,
    }),
  }
}

/**
 * 定着の出どころ。
 * 書く先は会話のアーカイブと同じ口と、パックごとのあらすじのファイル。
 * `query()` は雑談のセッションと同じ作業先・引き継いだ環境で起こす。
 */
function chatConsolidationSource(
  chatArchive: ChatArchive,
  cwd: string,
  inheritedEnv: Readonly<Record<string, string | undefined>>,
): ChatConsolidationSource {
  return {
    kind: "consolidate",
    consolidate: createChatConsolidationWriter({
      archive: chatArchive,
      chatSummary: (packName) => createChatSummary(packName),
      query: (request, signal) =>
        queryChatConsolidation(request, { cwd, env: inheritedEnv }, signal),
    }),
  }
}

/**
 * 訪問の台本をその場で作る口。
 * 人格と表情は作るときにパックの一覧を読み直し、今日の成果は読めなければ「分からない」にする。
 * `query()` は仕事のセッションと同じ作業先・引き継いだ環境で起こす。
 */
function visitScriptSource(
  cwd: string,
  inheritedEnv: Readonly<Record<string, string | undefined>>,
  achievementCommitCache: AchievementCommitCache,
  now: () => number,
): VisitScriptSource {
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
 * 提案を1件見送る。識別子（種類と対象の組）で書き、同じ識別子を返す（画面はこの識別子で札を消す）。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 */
function dismissUsageProposal(dismiss: UsageProposalDismissal): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}

/**
 * セッション駆動を1つ起こす。
 * 疑似セッションがあれば fake driver（claude を起こさない）、無ければ Agent SDK の駆動。
 * `scene` は fake driver のときだけ効く（名指しした場面を最初のタブが繋がったら流す。`TSUKUMO_FAKE_SCENE`）。
 */
function startDriver(options: {
  readonly seed: SessionLaunchSeed<CharacterPack>
  readonly chatArchive: ChatArchive
  readonly fakeSession: FakeSession | undefined
  readonly scene: string | undefined
  readonly firstViewer: Promise<void>
  readonly viewPort: number
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
  /** claude の子プロセスへ引き継ぐ環境変数（`Config.inheritedEnv`）。 */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  /** 印が付いたセッションのIDと、付けた印を受け取る口。 */
  readonly onSessionMarked: (sessionId: string, tag: string) => void
  readonly onEvent: (event: SessionEvent) => void
  /** サーバの時計（エポックミリ秒）。`recall` / `recall_episode` の採点が読む「いま」に使う。 */
  readonly now: () => number
}): SessionDriver {
  const { seed, chatArchive, fakeSession, cwd, inheritedEnv, onEvent } = options
  if (fakeSession !== undefined) {
    return startFakeSession({
      session: fakeSession,
      scene: options.scene,
      sessionDefault: seed.sessionDefault,
      firstViewer: options.firstViewer,
      onEvent,
    })
  }

  const mode = sessionMode(seed, chatArchive, cwd, onEvent, options.now)
  const tag = sessionTag(seed.pack.name, seed.chat, options.viewPort)

  return startSdkDriver({
    cwd,
    expressions: expressionChoices(seed.pack.definition),
    // 覚えた既定で起こす。起こしたあと帯から変えた値はそのセッション限りで、ここには戻らない。
    permissionMode: seed.sessionDefault.permissionMode,
    model: seed.sessionDefault.model,
    effort: seed.sessionDefault.effort,
    systemPromptAppend: takeSystemPromptAppend({
      persona: seed.pack.persona ?? "",
      mode: toSystemPromptMode(mode, chatArchive, seed.start, seed.pack.name),
    }),
    start: seed.start,
    tag,
    onSessionMarked: (sessionId) => options.onSessionMarked(sessionId, tag),
    mode,
    inheritedEnv,
    // 段に入るたびに読み直す（見直しの途中で見送りが増えても効く）。
    dismissedUsageProposalKeys: () => readDismissedUsageProposalKeys(),
    onEvent,
  })
}

/**
 * 歯車から届いた「新しいセッションの既定」を覚え、画面へ流すイベントを返す。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 */
function rememberSessionDefault(sessionDefault: SessionDefault): SessionEvent {
  writeRememberedSessionDefault(sessionDefault)
  return { kind: "session-default-changed", sessionDefault }
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

/**
 * そのモードのときだけ渡る口を1回の分岐でまとめる。
 * 雑談の3つは仕事のときに1つも渡らないので、`remember` / `forget` / `recall` / `recall_episode` のツールが載らず、作業の文脈が人格にもアーカイブにも入らない。
 * 3つは同時に渡るか同時に渡らないかの2択で、片方だけ無い状態を作らない。
 */
function sessionMode(
  seed: SessionLaunchSeed<CharacterPack>,
  chatArchive: ChatArchive,
  cwd: string,
  onEvent: (event: SessionEvent) => void,
  now: () => number,
): SessionMode {
  if (!seed.chat) {
    return { kind: "work" }
  }

  return {
    kind: "chat",
    // 書けた・消せたときだけ、更新後の一覧を画面へ流し直す。
    personaMemory: createPersonaMemory(seed.pack, cwd, undefined, (lines) =>
      onEvent({ kind: "remembered-lines-changed", lines }),
    ),
    chatSummary: createChatSummary(seed.pack.name),
    chatRecall: createChatRecall(chatArchive, seed.pack.name, now),
  }
}

/**
 * これから起こすキャラクターパックの、そのモードの続きから始めるセッションを探す。
 * 見つからないときと、探さない起こし方（`canResume` が偽で、一覧が空）のときは `{ kind: "new" }`（新規に起こす）。
 *
 * 雑談と仕事で引く印が違う（`sessionTag` の `chat`）。
 * 雑談へ入っても仕事の会話は続きにならず、そのパックで一度も雑談のターンを終えていなければ新規から始まる。
 * 同じディレクトリで2つめの tsukumo を起こしたときも目印が違うので、先に起きている側のセッションは引かない。
 *
 * 印はターンが終わってから少し遅れて付く（`SESSION_TAG_DELAY_MS`）ので、ターンを1つも終えずに離れたセッションは次に来たときに見つからず、新規から始まる。
 */
async function findPackSessionToResume(
  sessionCatalog: SessionCatalog,
  characterName: string,
  chat: boolean,
  viewPort: number,
): Promise<SessionStart> {
  const sessionId = await sessionCatalog.findToResume(sessionTag(characterName, chat, viewPort))
  return sessionId === undefined ? { kind: "new" } : { kind: "resume", sessionId }
}
