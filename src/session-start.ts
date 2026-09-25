// セッションを1つ起こす配線。**どの駆動で起こすか（本物の SDK か疑似セッションの fake driver
// か）と、続きから始めるセッションをどう探すか**をここで決め、起こす順序そのものは
// `src/server/session/core/session-launch.ts` に任せる（起動時も起こし直し（`session.switchCharacter` /
// `session.setChatMode`）も同じ関数を通る）。
//
// ここは配線層（`src/` 直下。docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { type CurrentCharacter } from "./current-character.ts"
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
import { type Config } from "./server/core/config.ts"
import { appendDiaryParagraph } from "./server/diary/adapter/diary.ts"
import { queryDiary } from "./server/diary/adapter/sdk-diary.ts"
import {
  createDiaryWriter,
  type DiaryWriterContext,
  type DiaryWriterSource,
} from "./server/diary/core/diary-writer.ts"
import { createOrcaHost } from "./server/host/adapter/orca-host.ts"
import { openTrackedFile } from "./server/host/core/tracked-file.ts"
import { listRepositoryFiles } from "./server/repository/adapter/repository-file.ts"
import { watchTaskSummary } from "./server/repository/adapter/task-summary.ts"
import { type FakeSession, startFakeSession } from "./server/session-driver/adapter/fake-driver.ts"
import { startSdkDriver } from "./server/session-driver/adapter/sdk-driver.ts"
import {
  findSessionToResume,
  listSwitchableSessions,
  readRestoredEvents,
} from "./server/session-driver/adapter/sdk-session.ts"
import { type PromptImageShelf } from "./server/session-driver/core/prompt-image-shelf.ts"
import {
  type ChatArchive,
  type SessionDriver,
  type SessionMode,
  type SessionStart,
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
import { type TokenUsageLog } from "./server/token-usage/core/token-usage.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "./server/usage-review/adapter/previous-usage-review.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "./server/usage-review/adapter/usage-proposal-dismissal.ts"
import { type SocketRouter } from "./server/view-server/adapter/session-socket.ts"
import { queryVisitScript } from "./server/visit/adapter/sdk-visit-script.ts"
import { createVisitClock } from "./server/visit/adapter/visit-clock.ts"
import { visitGuests } from "./server/visit/core/visit-guest.ts"
import {
  createVisitScriptWriter,
  type VisitScriptSource,
} from "./server/visit/core/visit-script-writer.ts"
import { visitCast } from "./server/visit/core/visit-script.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "./server/visit/core/visit-timing.ts"
import { UNKNOWN_ACHIEVEMENT } from "./shared/achievement.ts"
import { type UsageProposalDismissal } from "./shared/contract/usage-review.ts"
import { expressionChoices } from "./shared/expression-choice.ts"
import { type SessionChoice } from "./shared/session-choice.ts"
import { type SessionDefault } from "./shared/session-default.ts"
import { type SessionEvent } from "./shared/session-event.ts"
import { usageProposalKey, withoutDismissedProposals } from "./shared/usage-review.ts"

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /** fake driver の疑似セッション（`TSUKUMO_DRIVER=fake` のときだけ）。あるときは claude を
   * 起こさない。 */
  readonly fakeSession: FakeSession | undefined
  /**
   * トークン消費の記録の口。**持ち主は `src/main.ts`** — 分析の画面へ配る側（`view-delivery.ts`）も
   * 同じ口から読むので、置き場を知っているファイルを1つに保つ。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * 依頼に添えた画像の原寸の棚。**持ち主は `src/main.ts`**（`tokenUsageLog` と同じ形で、
   * 置く・捨てるのはセッション、配るのは `view-delivery.ts`）。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * ビューが実際に待ち受けているポート。**セッションの印の目印がここから決まる**
   * （`sessionTag`。docs/requirements.md 4.8「鍵」）。同じディレクトリで2つめを起こすと
   * ポートがずれ、目印も分かれるので、互いのセッションを取り合わない。
   */
  readonly viewPort: number
}

/** 起こしたセッションと、開いたタブがそれを触るコマンドの手続き。 */
export type StartedSession = {
  readonly manager: SessionManager
  /** `/ws` に載せるルータ（`src/router.ts`）。書き込み口の中身はここで選んで渡す。 */
  readonly socketRouter: SocketRouter
}

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export function startSession(options: SessionStartOptions): StartedSession {
  const { config, character, fakeSession, tokenUsageLog, promptImageShelf, viewPort } = options
  // claude の作業先は tsukumo を起こしたディレクトリ（作業ツリーを分けるのは orca の側）。
  const cwd = process.cwd()
  // 雑談の会話のアーカイブの口は1つ（`docs/design.md` 7章）。**書くのは `session-manager` から
  // 1件ずつ、読むのはセッションを起こすとき1回だけ**と持ち場が違うが、触るファイルは同じなので
  // 境界は増やさない（原則3）。
  const chatArchive = createChatArchive()
  // コンテキストの内訳の記録の口も1つ（`~/.tsukumo/context-usage/`）。**書くのは
  // `session-manager` から、セッション1つにつき1行だけ**で、読むのは tsukumo の外なので、
  // ここで作ってそのまま渡す。
  const contextUsageLog = createContextUsageLog()
  // レポートのパスを開く先（`main.ts` の `openLayoutView` とは別に、ここでも1つ作る。
  // `createOrcaHost()` は状態を持たないので、作り直しても構わない）。
  const host = createOrcaHost()
  // 成果の振り返り（`session.reflectAchievement`）がその日の成果を数え直すための入れ物。**配線層
  // （`view-delivery.ts`）が手続き `achievement.day` で配るのと別に1つ持つ**——両者は別の層（`src/`
  // 直下）で、依存し合わせない。同じ日を両方から数えても、今日以外の日はどちらかが先に
  // 覚えた数を使うだけで結果は変わらない（`src/server/achievement/adapter/main-history.ts`）。
  const achievementCommitCache = createAchievementCommitCache()
  // 振り返りの書き手が読む、直近に起こした代のパック情報（`docs/design.md`「日記の受け取りと
  // 保存」「問い合わせの起こし方」）。**`startDriver` を呼ぶたびに更新する**——書いた時点の
  // パックで書かせるため（キャラクターを切り替えたあとの振り返りは、切り替えたあとのパックで
  // 書く）。
  let diaryContext: DiaryWriterContext | undefined = undefined
  // サーバの時計は1つ（`TSUKUMO_FIXED_CLOCK` なら止まった時計）。
  const now = createServerClock(config.fixedClock)
  // 最初のタブが繋がったら解ける約束。fake driver は疑似セッションをここから流し始める
  // （`FakeDriverOptions.firstViewer`）。本物の駆動は待たない。
  const firstViewer = Promise.withResolvers<void>()
  const manager = createSessionManager({
    // 時刻は**エポックミリ秒の数**のまま渡す（`Temporal.Instant` にしない）。両側で回す
    // 畳み込み（`src/shared/`）が比較と引き算にしか使わず、数なら偽の時計も数で済む。
    now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    // 書き先の判定（雑談かどうか）は `session-manager` の `receive` が持つので、ここは口を
    // 渡すだけ。
    chatArchive,
    // 定着の出どころ。いつ起こすかは `session-manager` が決める。疑似セッションでは claude を
    // 起こさないので走らせない（`docs/chat-mode.md` 4.9）。
    chatConsolidation:
      fakeSession === undefined
        ? chatConsolidationSource(chatArchive, cwd, config.inheritedEnv)
        : { kind: "dont-consolidate" },
    // トークン消費の記録の口。書くかどうか・何を書くかを決めるのは `session-manager` なので、
    // ここも受け取った口を渡すだけ。
    tokenUsageLog,
    // いつ1行書くか（そのセッションでまだ書いていない最初のターンの終わり）を決めるのも
    // `session-manager` なので、ここも口を渡すだけ。
    contextUsageLog,
    // 置く契機（`prompt`）と捨てる契機（記録の窓）を決めるのも `session-manager`。
    promptImageShelf,
    launchSession: createSessionLaunch<CharacterPack>({
      choosePack: (selection) => character.choose(selection),
      rememberPack: (pack) => character.remember(pack),
      // 覚えた既定は**起こすたびに読む**（歯車で書き換えたあと、起こし直しで効く）。
      readSessionDefault: () => readRememberedSessionDefault(),
      // 覚えた「訪問」のオン・オフも起こすたびに読む。`visit.setEnabled` はこれとは別に
      // いま動いているセッションにも即座に効くので、ここで読むのは「起こした直後の初期値」だけ
      // （`docs/screen-design.md` 13.6）。
      readVisitEnabled: () => readRememberedVisitEnabled(),
      characterEvent: () => character.event(),
      // 雑談で起こすときだけ呼ばれる（`createSessionLaunch`）。写しを読む口は駆動へ渡すものと
      // 同じ作り方で、取り出し方は core（`readChatTopics`）。
      readChatTopics: (pack) => readChatTopics(createChatSummary(pack.name)),
      // 覚えたことの一覧も、雑談で起こすときだけ呼ばれる。読むのは adapter
      // （`persona-memory.ts` の `readRememberedLines`）。
      readRememberedLines: (pack) => readRememberedLines(pack),
      // `main` の develop/tasks.json の見張り。サイドバーの React の部品が `tasks-changed` を状態に
      // 畳んで読む（docs/design.md 5章「task-summary.ts」）。
      watchTasks: (onEvent) =>
        watchTaskSummary(cwd, (tasks) => onEvent({ kind: "tasks-changed", tasks })),
      findResumeSession: (pack, chat) =>
        findPackSessionToResume(config, cwd, pack.name, chat, viewPort),
      listSessions: (pack, chat) => listPackSessions(config, cwd, pack.name, chat, viewPort),
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
          onEvent,
          now,
        })
      },
      restoreEvents: (resumed, pack) =>
        readRestoredEvents(resumed, expressionChoices(pack.definition)),
    }),
    // 前回の見直しの結果は、起こしたときにホームから読んで初期の姿へ差し込む
    // （`docs/design.md`「見直しのツールと状態」）。書くのは結果が届くたびで、
    // どちらも既定の置き場（`~/.tsukumo/usage-review.json`）をそのまま使う。読むときに
    // 見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
    readPreviousUsageReview: () =>
      withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
    writePreviousUsageReview,
    // 訪問の見張りの口。客の候補は**来るときに**パックの一覧を読み直して拾う（画面から作った・
    // 直したパックもその場で効く）。しきい値を縮めるのは `TSUKUMO_VISIT_QUICK=1` のときだけ。
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
  // コマンドの手続き（`src/router.ts`）。書き込みの中身はここで選んで渡す。
  const socketRouter = createSocketRouter({
    session: {
      // 置く契機（`prompt`）は表の行、捨てる契機（記録の窓）は `session-manager`。
      promptImageShelf,
      // 歯車から届いた既定は、覚えてから画面へ流し直すだけ（いまのセッションには効かない）。
      rememberSessionDefault: (sessionDefault) => rememberSessionDefault(sessionDefault),
      // **手続き `achievement.day`（`src/view-delivery.ts`）と同じ数え方**（`readAchievement`）。「今日」を
      // 決めるのもそちらと同じくここ（配線層）の仕事。読めなかった・`main` が読めない日は
      // `undefined` に畳み、断る理由は表の行（`session-command.ts`）が決める。
      readAchievementDay: async (date) => {
        const result = await readAchievement(cwd, date, todayLocalDateKey(), achievementCommitCache)
        return result.kind === "ok" ? result.achievement : undefined
      },
      // 振り返りの書き手の出どころ。疑似セッションでは起こさない
      // （`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。
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
    // 歯車から届いた「訪問」のオン・オフは、覚えてから画面へ流し直す。**こちらは
    // いま動いているセッションにも即座に効く**（`visit-command.ts`）。
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
 * 振り返りの書き手の出どころ（`docs/design.md`「日記の受け取りと保存」）。書く時点のパックは
 * `readContext` で毎回読み直す——`session-command.ts` が数え直した材料と組み合わせて
 * {@link createDiaryWriter} へ渡す。`cwd` はリポジトリの見分けに使う（`appendDiaryParagraph`）。
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
 * 定着の出どころ（`docs/design.md` 7章「定着はどこで走るか」）。書く先は会話のアーカイブと
 * 同じ口と、パックごとのあらすじのファイル。`query()` は雑談のセッションと同じ作業先・
 * 引き継いだ環境で起こす。
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
 * 訪問の台本をその場で作る口（`docs/design.md` 5章「訪問の台本」）。人格と表情は**作るときに**
 * パックの一覧を読み直し、今日の成果は `readAchievementDay` と同じ数え方で読む（読めなければ
 * 「分からない」）。`query()` は仕事のセッションと同じ作業先・引き継いだ環境で起こす。
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
 * 提案を1件見送る。**識別子（種類と対象の組）で書き、同じ識別子を返す**（画面はこの識別子で
 * 札を消す）。書き込みは失敗しても例外を投げないので、返すイベントは常に1つ
 * （`rememberSessionDefault` と同じ立場）。
 */
function dismissUsageProposal(dismiss: UsageProposalDismissal): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}

/**
 * セッション駆動を1つ起こす。**疑似セッションがあれば fake driver**（claude を起こさない。
 * `TSUKUMO_DRIVER=fake`）、無ければ Agent SDK の駆動。`scene` は fake driver のときだけ効く
 * （名指しした場面を最初のタブが繋がったら流す。`TSUKUMO_FAKE_SCENE`）。
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

  // **雑談のときだけ渡る3つの口は、1回の分岐でまとめて作る**（`SessionMode`。3つは同時に
  // 渡るか同時に渡らないかの2択で、片方だけ無い状態は実在しない）。
  const mode = sessionMode(seed, chatArchive, cwd, onEvent, options.now)

  return startSdkDriver({
    cwd,
    expressions: expressionChoices(seed.pack.definition),
    // **覚えた既定で起こす**（`docs/screen-design.md` 13.6）。起こしたあと帯から変えた値は
    // そのセッション限りで、ここには戻らない。
    permissionMode: seed.sessionDefault.permissionMode,
    model: seed.sessionDefault.model,
    effort: seed.sessionDefault.effort,
    // **何がどの順で載るかは core（`system-prompt.ts`）が持つ**ので、ここは人格の文面と口を
    // 渡すだけ（`docs/design.md` 7章）。**人格の「無い」はここで畳む**（core へ
    // `| undefined` を運ばない）。
    systemPromptAppend: takeSystemPromptAppend({
      persona: seed.pack.persona ?? "",
      mode: toSystemPromptMode(mode, chatArchive, seed.start, seed.pack.name),
    }),
    start: seed.start,
    tag: sessionTag(seed.pack.name, seed.chat, options.viewPort),
    mode,
    inheritedEnv,
    // **段に入るたびに読み直す**（見直しの途中で見送りが増えても効く。
    // `docs/design.md`「見直しのツールと状態」）。
    dismissedUsageProposalKeys: () => readDismissedUsageProposalKeys(),
    onEvent,
  })
}

/**
 * 歯車から届いた「新しいセッションの既定」を覚え、画面へ流すイベントを返す
 * （`docs/screen-design.md` 13.6）。**書き込みは失敗しても例外を投げない**ので、返すイベントは
 * 常に1つ（`writeRememberedSessionDefault`）。
 */
function rememberSessionDefault(sessionDefault: SessionDefault): SessionEvent {
  writeRememberedSessionDefault(sessionDefault)
  return { kind: "session-default-changed", sessionDefault }
}

/**
 * 歯車から届いた「訪問」のオン・オフを覚え、画面へ流すイベントを返す（`docs/screen-design.md`
 * 13.6）。**覚え方は {@link rememberSessionDefault} と同じ**（書き込みは失敗しても例外を
 * 投げないので、返すイベントは常に1つ）。**このイベントは駆動由来のイベントと同じ `receive` を
 * 通る**ので、いま動いているセッションの訪問の見張りにも即座に届く（`session-manager.ts`）。
 */
function rememberVisitEnabled(visitEnabled: boolean): SessionEvent {
  writeRememberedVisitEnabled(visitEnabled)
  return { kind: "visit-enabled-changed", visitEnabled }
}

/**
 * そのモードのときだけ渡る口を1回の分岐でまとめる（`docs/design.md` 7章・7.1）。**雑談の3つは
 * 仕事のときに1つも渡らない**ので、`remember` / `forget` / `recall` / `recall_episode` のツールが
 * 載らず、作業の文脈が人格にもアーカイブにも入らない。
 *
 * **`chatRecall` はパックの名前と読む量（`docs/chat-mode.md` 4.9 の容量の表）をここで縛ってから
 * 渡す**（`createChatRecall`。`src/server/chat/core/chat-recall.ts`）。
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
    // **書けた・消せたときだけ**、更新後の一覧を画面へ流し直す（`persona-memory.ts` の
    // `createPersonaMemory` の `onChange`。`docs/design.md` 7.1・`docs/screen-design.md` 13.7）。
    personaMemory: createPersonaMemory(seed.pack, cwd, undefined, (lines) =>
      onEvent({ kind: "remembered-lines-changed", lines }),
    ),
    chatSummary: createChatSummary(seed.pack.name),
    chatRecall: createChatRecall(chatArchive, seed.pack.name, now),
  }
}

/**
 * 画面の `<select>` に出す、切り替え先のセッションの一覧（`docs/requirements.md` 4.8）。
 * **いまの部屋の印を持つもの**だけが並ぶ（絞り込みの理由は
 * `src/server/session-driver/core/session-restore.ts` の `listMarkedSessions`）。
 *
 * **続きを探さない起こし方のときは一覧も出さない**（{@link canResume}。
 * 続きから始めない約束で起こしているのに、切り替え先だけ出ると辻褄が合わない）。
 */
async function listPackSessions(
  config: Config,
  cwd: string,
  characterName: string,
  chat: boolean,
  viewPort: number,
): Promise<readonly SessionChoice[]> {
  return canResume(config)
    ? listSwitchableSessions(cwd, sessionTag(characterName, chat, viewPort))
    : []
}

/**
 * これから起こすキャラクターパックの、そのモードの続きから始めるセッションを探す
 * （docs/requirements.md 4.8）。見つからなければ `{ kind: "new" }`（新規に起こす）。
 *
 * **雑談と仕事で引く印が違う**（docs/chat-mode.md 4.9）。雑談へ入っても仕事の会話が続きに
 * ならないのはここで、代わりに**そのパックで一度も雑談のターンを終えていなければ新規から
 * 始まる**。
 *
 * **同じディレクトリで2つめの tsukumo を起こしたときは目印が違う**ので（ポートから決まる。
 * `sessionTag`）、先に起きている側のセッションは引かない。
 *
 * **印はターンが終わって3秒後に付く**ので、ターンを1つも終えずに離れたセッションは
 * 次に来たときに見つからず、新規から始まる（`SESSION_TAG_DELAY_MS`。4.8「復元できなかったとき
 * どうするか」の範囲）。fake driver は claude を起こさないので、そもそも探さない。
 *
 * **`findSessionToResume` の「見つからない」（`string | undefined`）をここで `SessionStart` へ
 * 畳む**——見つかったかどうかという外の世界の事実と、それが運ぶ「新規か続きか」という
 * 意味とを、この入口で1つの合併型に変える（`docs/coding-standards.md`「「無い」を層をまたいで
 * 運ばない」）。**探さない起こし方（{@link canResume}）のときも同じ合併型で `{ kind: "new" }`
 * に畳む**（探した結果の「無い」と、探さないと決めていることを呼び出し側が区別しなくて済む）。
 */
async function findPackSessionToResume(
  config: Config,
  cwd: string,
  characterName: string,
  chat: boolean,
  viewPort: number,
): Promise<SessionStart> {
  if (!canResume(config)) {
    return { kind: "new" }
  }

  const sessionId = await findSessionToResume(cwd, sessionTag(characterName, chat, viewPort))
  return sessionId === undefined ? { kind: "new" } : { kind: "resume", sessionId }
}
