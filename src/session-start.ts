// セッションを1つ起こす配線。**どの駆動で起こすか（本物の SDK か疑似セッションの fake driver
// か）と、続きから始めるセッションをどう探すか**をここで決め、起こす順序そのものは
// `src/server/core/session-launch.ts` に任せる（起動時も起こし直し（`switch-character` /
// `set-chat-mode`）も同じ関数を通る）。
//
// ここは配線層（`src/` 直下。docs/design.md 2章「層と依存の向き」）。

import process from "node:process"

import { type CurrentCharacter } from "./current-character.ts"
import { type CharacterPack, listCharacterPacks } from "./server/adapter/character-pack.ts"
import { createChatArchive } from "./server/adapter/chat-archive.ts"
import { createChatSummary } from "./server/adapter/chat-summary.ts"
import { createContextUsageLog } from "./server/adapter/context-usage-log.ts"
import { type FakeSession, startFakeSession } from "./server/adapter/fake-driver.ts"
import { localTimeHHMM, todayLocalDateKey } from "./server/adapter/local-time.ts"
import {
  type AchievementCommitCache,
  createAchievementCommitCache,
  readAchievement,
} from "./server/adapter/main-history.ts"
import { createOrcaHost } from "./server/adapter/orca-host.ts"
import { createPersonaMemory, readRememberedLines } from "./server/adapter/persona-memory.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "./server/adapter/previous-usage-review.ts"
import {
  readRememberedSessionDefault,
  readRememberedVisitEnabled,
  writeRememberedSessionDefault,
  writeRememberedVisitEnabled,
} from "./server/adapter/remembered-default.ts"
import { listRepositoryFiles } from "./server/adapter/repository-file.ts"
import { startSdkDriver } from "./server/adapter/sdk-driver.ts"
import {
  findSessionToResume,
  listSwitchableSessions,
  readRestoredEvents,
} from "./server/adapter/sdk-session.ts"
import { queryVisitScript } from "./server/adapter/sdk-visit-script.ts"
import { watchTaskSummary } from "./server/adapter/task-summary.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "./server/adapter/usage-proposal-dismissal.ts"
import { createVisitClock } from "./server/adapter/visit-clock.ts"
import { readChatTopics } from "./server/core/chat-compact.ts"
import { type Config } from "./server/core/config.ts"
import { EVENT_BATCH_INTERVAL_MS } from "./server/core/event-batch.ts"
import { type PromptImageShelf } from "./server/core/prompt-image-shelf.ts"
import {
  type ChatArchive,
  type ChatRecall,
  type SessionDriver,
  type SessionMode,
  type SessionStart,
} from "./server/core/session-driver.ts"
import { createSessionLaunch, type SessionLaunchSeed } from "./server/core/session-launch.ts"
import { createSessionManager, type SessionManager } from "./server/core/session-manager.ts"
import { canResume, sessionTag } from "./server/core/session-restore.ts"
import { takeSystemPromptAppend, toSystemPromptMode } from "./server/core/system-prompt.ts"
import { type TokenUsageLog } from "./server/core/token-usage.ts"
import { openTrackedFile } from "./server/core/tracked-file.ts"
import { visitGuests } from "./server/core/visit-guest.ts"
import {
  createVisitScriptWriter,
  type VisitScriptSource,
} from "./server/core/visit-script-writer.ts"
import { visitCast } from "./server/core/visit-script.ts"
import { QUICK_VISIT_TIMING, VISIT_TIMING } from "./server/core/visit-timing.ts"
import { UNKNOWN_ACHIEVEMENT } from "./shared/achievement.ts"
import { CHAT_COMPACT_THRESHOLD_BYTES, CHAT_RECALL_READBACK_BYTES } from "./shared/chat-log.ts"
import { type DismissUsageProposalCommand } from "./shared/command.ts"
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

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export function startSession(options: SessionStartOptions): SessionManager {
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
  // 成果の振り返り（`reflect-achievement`）がその日の成果を数え直すための入れ物。**配線層
  // （`view-delivery.ts`）が `/achievement` に配るのと別に1つ持つ**——両者は別の層（`src/`
  // 直下）で、依存し合わせない。同じ日を両方から数えても、今日以外の日はどちらかが先に
  // 覚えた数を使うだけで結果は変わらない（`src/server/adapter/main-history.ts`）。
  const achievementCommitCache = createAchievementCommitCache()
  return createSessionManager({
    // 時刻は**エポックミリ秒の数**のまま渡す（`Temporal.Instant` にしない）。両側で回す
    // 畳み込み（`src/shared/`）が比較と引き算にしか使わず、数なら偽の時計も数で済む。
    now: () => Temporal.Now.instant().epochMilliseconds,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
    // 書き先の判定（雑談かどうか）は `session-manager` の `receive` が持つので、ここは口を
    // 渡すだけ。
    chatArchive,
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
      // 覚えた「訪問」のオン・オフも起こすたびに読む。`set-visit-enabled` はこれとは別に
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
      startDriver: (seed, onEvent) =>
        startDriver({
          seed,
          chatArchive,
          fakeSession,
          scene: config.fakeScene,
          viewPort,
          cwd,
          inheritedEnv: config.inheritedEnv,
          onEvent,
        }),
      restoreEvents: (resumed, pack) =>
        readRestoredEvents(resumed, expressionChoices(pack.definition)),
    }),
    // 歯車から届いた既定は、覚えてから画面へ流し直すだけ（いまのセッションには効かない）。
    rememberSessionDefault: (sessionDefault) => rememberSessionDefault(sessionDefault),
    // 歯車から届いた「訪問」のオン・オフは、覚えてから画面へ流し直す。**こちらは
    // いま動いているセッションにも即座に効く**（`rememberVisitEnabled` の doc コメント）。
    rememberVisitEnabled: (visitEnabled) => rememberVisitEnabled(visitEnabled),
    editCharacter: (edit) => Promise.resolve(character.applyEdit(edit)),
    createCharacter: (create) => Promise.resolve(character.applyCreate(create)),
    deleteCharacter: (remove) => Promise.resolve(character.applyDelete(remove)),
    forgetRememberedLine: (line) => Promise.resolve(character.forgetRememberedLine(line)),
    // 前回の見直しの結果は、起こしたときにホームから読んで初期の姿へ差し込む
    // （`docs/design.md`「見直しのツールと状態」）。書くのは結果が届くたびで、
    // どちらも既定の置き場（`~/.tsukumo/usage-review.json`）をそのまま使う。読むときに
    // 見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
    readPreviousUsageReview: () =>
      withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
    writePreviousUsageReview,
    dismissUsageProposal: (dismiss) => dismissUsageProposal(dismiss),
    openFile: (path) =>
      openTrackedFile(
        path,
        () => listRepositoryFiles(cwd),
        (tracked) => host.openFile(tracked),
      ),
    // **`GET /achievement`（`src/view-delivery.ts`）と同じ数え方**（`readAchievement`）。「今日」を
    // 決めるのもそちらと同じくここ（配線層）の仕事。読めなかった・`main` が読めない日は
    // `undefined` に畳み、断る理由は session-manager が決める。
    readAchievementDay: async (date) => {
      const result = await readAchievement(cwd, date, todayLocalDateKey(), achievementCommitCache)
      return result.kind === "ok" ? result.achievement : undefined
    },
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
          ? visitScriptSource(cwd, config.inheritedEnv, achievementCommitCache)
          : { kind: "pack-only" },
    },
  })
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
      localTime: () => localTimeHHMM(Temporal.Now.instant().epochMilliseconds),
      query: (request, signal) => queryVisitScript(request, { cwd, env: inheritedEnv }, signal),
    }),
  }
}

/**
 * 提案を1件見送る。**識別子（種類と対象の組）で書き、同じ識別子を返す**（画面はこの識別子で
 * 札を消す）。書き込みは失敗しても例外を投げないので、返すイベントは常に1つ
 * （`rememberSessionDefault` と同じ立場）。
 */
function dismissUsageProposal(dismiss: DismissUsageProposalCommand): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}

/**
 * セッション駆動を1つ起こす。**疑似セッションがあれば fake driver**（claude を起こさない。
 * `TSUKUMO_DRIVER=fake`）、無ければ Agent SDK の駆動。`scene` は fake driver のときだけ効く
 * （名指しした場面を起こした直後に流す。`TSUKUMO_FAKE_SCENE`）。
 */
function startDriver(options: {
  readonly seed: SessionLaunchSeed<CharacterPack>
  readonly chatArchive: ChatArchive
  readonly fakeSession: FakeSession | undefined
  readonly scene: string | undefined
  readonly viewPort: number
  /** claude の作業先（tsukumo を起こしたディレクトリ）。 */
  readonly cwd: string
  /** claude の子プロセスへ引き継ぐ環境変数（`Config.inheritedEnv`）。 */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>
  readonly onEvent: (event: SessionEvent) => void
}): SessionDriver {
  const { seed, chatArchive, fakeSession, cwd, inheritedEnv, onEvent } = options
  if (fakeSession !== undefined) {
    return startFakeSession({
      session: fakeSession,
      scene: options.scene,
      sessionDefault: seed.sessionDefault,
      onEvent,
    })
  }

  // **雑談のときだけ渡る4つの口は、1回の分岐でまとめて作る**（`SessionMode`。4つは同時に
  // 渡るか同時に渡らないかの2択で、片方だけ無い状態は実在しない）。
  const mode = sessionMode(seed, chatArchive, cwd, onEvent)

  return startSdkDriver({
    cwd,
    expressions: expressionChoices(seed.pack.definition),
    // **表示名の「無い」はここで畳む**（ディレクトリ名へ落とす。core へ `| undefined` を運ばない）。
    diaryWriter: { pack: seed.pack.name, name: seed.pack.definition?.name ?? seed.pack.name },
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
 * そのモードのときだけ渡る口を1回の分岐でまとめる（`docs/design.md` 7章・7.1）。**雑談の4つは
 * 仕事のときに1つも渡らない**ので、`remember` / `forget` / `keep` / `index` / `recall` のツールも
 * `PostCompact` フックも載らず、作業の文脈が人格にもアーカイブにも入らない。
 *
 * 渡すのは書き口と同じ1つのアーカイブだが、**駆動から見えるのは旗を立てる動きと索引の2つだけ**
 * （`ChatKeep` / `ChatRecall`）。**パックの名前と読む量をここで縛ってから渡す**。
 */
function sessionMode(
  seed: SessionLaunchSeed<CharacterPack>,
  chatArchive: ChatArchive,
  cwd: string,
  onEvent: (event: SessionEvent) => void,
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
    chatKeep: chatArchive,
    chatRecall: chatRecallFor(chatArchive, seed.pack.name),
  }
}

/**
 * 索引の書き口・引く口を、1つのパックに縛って駆動へ渡す形にする（`docs/design.md` 7章）。
 * **読む量を決めるのも配線層**で、アーカイブ側は渡されたバイト数までしか読まない
 * （`readRecent` に窓と旗の上限を渡すのと同じ手）。
 */
function chatRecallFor(chatArchive: ChatArchive, packName: string): ChatRecall {
  return {
    index: (line) => chatArchive.writeIndex(packName, line),
    recall: (keyword) => chatArchive.recall(packName, keyword, CHAT_RECALL_READBACK_BYTES),
  }
}

/**
 * 画面の `<select>` に出す、切り替え先のセッションの一覧（`docs/requirements.md` 4.8）。
 * **いまの部屋の印を持つもの**だけが並ぶ（絞り込みの理由は
 * `src/server/core/session-restore.ts` の `listMarkedSessions`）。
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
