// セッションを起こす配線。
// どの駆動で起こすか（本物の SDK か疑似セッションの fake driver か）と、切り替え先の一覧をどこから読むかをここで決める。
// 起こす順序そのものは `createSessionLaunch` に任せる（起動時も起こし直しも同じ関数を通る）。

import type { CurrentCharacter } from "../current-character.ts"
import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { createChatSummary } from "../server/chat/adapter/chat-summary.ts"
import { createPersonaMemory, readRememberedLines } from "../server/chat/adapter/persona-memory.ts"
import { readChatTopics } from "../server/chat/core/chat-consolidation.ts"
import { createChatRecall } from "../server/chat/core/chat-recall.ts"
import type { Config } from "../server/core/config.ts"
import type { DiagnosticLog } from "../server/diagnostic/core/diagnostic.ts"
import { readBeadsWorkspace } from "../server/repository/adapter/beads.ts"
import { startFakeSession } from "../server/session-driver/adapter/fake-driver.ts"
import {
  createFakeSessionCatalog,
  readFakeRestoredEvents,
} from "../server/session-driver/adapter/fake-session-resume.ts"
import { startSdkDriver } from "../server/session-driver/adapter/sdk-driver.ts"
import {
  listRepositorySessions,
  readRestoredEvents,
} from "../server/session-driver/adapter/sdk-session.ts"
import {
  createSessionClaimFile,
  defaultSessionClaimPlace,
} from "../server/session-driver/adapter/session-claim-file.ts"
import {
  createSessionCatalog,
  type SessionCatalog,
} from "../server/session-driver/core/session-catalog.ts"
import { createSessionClaim } from "../server/session-driver/core/session-claim.ts"
import type { SessionDriver, SessionMode } from "../server/session-driver/core/session-driver.ts"
import { sessionTag } from "../server/session-driver/core/session-mark.ts"
import {
  readRememberedSessionDefault,
  writeRememberedSessionDefault,
} from "../server/session/adapter/remembered-default.ts"
import type { SessionCommandPorts } from "../server/session/core/session-command.ts"
import {
  createSessionLaunch,
  type SessionLaunchSeed,
} from "../server/session/core/session-launch.ts"
import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import {
  takeSystemPromptAppend,
  toSystemPromptMode,
} from "../server/system-prompt/core/system-prompt.ts"
import { readDismissedUsageProposalKeys } from "../server/usage-review/adapter/usage-proposal-dismissal.ts"
import { expressionChoices, expressionNames } from "../shared/character-pack/expression-choice.ts"
import type { PromptDelayFootprint } from "../shared/diagnostic/diagnostic-record.ts"
import type { SwallowedFailurePlace } from "../shared/diagnostic/swallowed-failure.ts"
import type { SessionDefault } from "../shared/session/session-default.ts"
import type { RestoredEvent, SessionEvent } from "../shared/session/session-event.ts"
import { failureDiagnostic } from "./failure-diagnostic.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireSessionLaunch(options: {
  readonly context: WiringContext
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /**
   * ビューが実際に待ち受けているポート。セッションの印の目印がここから決まる（`sessionTag`）。
   * 同じディレクトリで2つめを起こすとポートがずれ、目印も分かれるので、互いのセッションを取り合わない。
   */
  readonly viewPort: number
  /** 取り込んだ tsukumo-plugins をセッションに載せるか。 */
  readonly mountWorkflowPlugin: boolean
  /** 最初のタブが繋がったら解ける約束。fake driver は疑似セッションをここから流し始める。本物の駆動は待たない。 */
  readonly firstViewer: Promise<void>
  /**
   * 駆動を起こす直前に、起こす代の種とその代の受け取り口を受け取る口。
   * `restored` は、その代で組み直して流し終えた履歴で解ける（新規で起こした・読めなかったときは空）。
   * 戻り値は、その代の受け取り口に流れた出来事を観る口（その代が続くあいだ、流れた出来事ごとに呼ぶ）。
   */
  readonly onLaunch: (
    seed: SessionLaunchSeed<CharacterPack>,
    onEvent: (event: SessionEvent) => void,
    restored: Promise<readonly RestoredEvent[]>,
  ) => (event: SessionEvent) => void
  /** 診断ログの書き込み口。握りつぶした失敗（履歴の組み直し・覚えたことの書き込み）を書く。 */
  readonly diagnosticLog: DiagnosticLog
}): {
  readonly manager: Pick<SessionManagerOptions, "launchSession">
  readonly sessionCommands: Pick<
    SessionCommandPorts,
    "rememberSessionDefault" | "reserveSession" | "withdrawSessionClaim"
  >
  /** このプロセスの名乗りを消す（プロセスを閉じるとき）。 */
  readonly releaseSessionClaim: () => void
} {
  const { context, config, character, viewPort } = options
  const reportFailure = failureDiagnostic(options.diagnosticLog, context.now)
  // 印の付いたセッションの一覧。ここで1回読み始め、起こし直しはメモリの一覧から切り替え先を出す。
  const sessionCatalog = chooseSessionCatalog(context, config)
  const sessionClaim = createSessionClaim(
    createSessionClaimFile({
      place: defaultSessionClaimPlace(),
      reportFailure: (error) =>
        reportFailure({ feature: "session", place: "session-claim" }, error),
    }),
  )
  return {
    manager: {
      launchSession: createSessionLaunch<CharacterPack>({
        choosePack: (selection) => character.choose(selection),
        rememberPack: (pack) => character.remember(pack),
        // 覚えた既定は起こすたびに読む（歯車で書き換えたあと、起こし直しで効く）。
        readSessionDefault: () => readRememberedSessionDefault(),
        characterEvent: () => character.event(),
        readChatTopics: (pack) => readChatTopics(createChatSummary(pack.name)),
        readRememberedLines: (pack) => readRememberedLines(pack),
        listSessions: (pack, chat) =>
          sessionCatalog.listChoices(sessionTag(pack.name, chat, viewPort)),
        refreshSessions: () => sessionCatalog.refresh(),
        startDriver: (seed, onEvent, restored) => {
          const observeClaim = sessionClaim.noteLaunched(seed.start)
          const observe = options.onLaunch(seed, onEvent, restored)
          const watched = (event: SessionEvent): void => {
            onEvent(event)
            observe(event)
            observeClaim(event)
          }
          return startDriver({
            seed,
            context,
            scene: config.fakeScene,
            sceneUntil: config.fakeSceneUntil,
            claudeConfigDir: config.claudeConfigDir,
            mountWorkflowPlugin: options.mountWorkflowPlugin,
            firstViewer: options.firstViewer,
            viewPort,
            onSessionMarked: (sessionId, tag) => sessionCatalog.noteMarked(sessionId, tag),
            onEvent: watched,
            reportFailure,
            reportPromptDelay: (footprint) => options.diagnosticLog.append([footprint]),
          })
        },
        restoreEvents: (resumed, pack) =>
          context.fakeSession === undefined
            ? readRestoredEvents(resumed, expressionChoices(pack.definition))
            : Promise.resolve(
                readFakeRestoredEvents(
                  context.fakeSession,
                  resumed,
                  expressionNames(expressionChoices(pack.definition)),
                ),
              ),
        diagnosticLog: options.diagnosticLog,
        now: context.now,
      }),
    },
    sessionCommands: {
      // 歯車から届いた既定は、覚えてから画面へ流し直すだけ（いまのセッションには効かない）。
      rememberSessionDefault: (sessionDefault) => rememberSessionDefault(sessionDefault),
      reserveSession: (sessionId) => sessionClaim.reserve(sessionId),
      withdrawSessionClaim: () => sessionClaim.withdraw(),
    },
    releaseSessionClaim: () => sessionClaim.withdraw(),
  }
}

/** fake driver なら疑似セッションの一覧、それ以外は SDK の一覧。 */
function chooseSessionCatalog(context: WiringContext, config: Config): SessionCatalog {
  return context.fakeSession === undefined
    ? createSessionCatalog({ read: () => listRepositorySessions(context.cwd), now: context.now })
    : createFakeSessionCatalog(context.fakeSession, config.fakeScene)
}

/**
 * セッション駆動を1つ起こす。
 * 疑似セッションがあれば fake driver（claude を起こさない）、無ければ Agent SDK の駆動。
 * `scene` は fake driver のときだけ効く（名指しした場面を最初のタブが繋がったら流す。`TSUKUMO_FAKE_SCENE`）。
 */
function startDriver(options: {
  readonly seed: SessionLaunchSeed<CharacterPack>
  readonly context: WiringContext
  readonly scene: string | undefined
  readonly sceneUntil: number | undefined
  readonly claudeConfigDir: string | undefined
  readonly mountWorkflowPlugin: boolean
  readonly firstViewer: Promise<void>
  readonly viewPort: number
  /** 印が付いたセッションのIDと、付けた印を受け取る口。 */
  readonly onSessionMarked: (sessionId: string, tag: string) => void
  readonly onEvent: (event: SessionEvent) => void
  /** 握りつぶした失敗を診断ログへ書く口。 */
  readonly reportFailure: (place: SwallowedFailurePlace, error: unknown) => void
  /** 依頼が本体へ届くまでの遅れを診断ログへ書く口。 */
  readonly reportPromptDelay: (footprint: PromptDelayFootprint) => void
}): SessionDriver {
  const { seed, context, onEvent } = options
  const { chatArchive, cwd, inheritedEnv, fakeSession } = context
  if (fakeSession !== undefined) {
    return startFakeSession({
      session: fakeSession,
      scene: options.scene,
      sceneUntil: options.sceneUntil,
      sessionDefault: seed.sessionDefault,
      firstViewer: options.firstViewer,
      expressions: expressionNames(expressionChoices(seed.pack.definition)),
      onEvent,
    })
  }

  const mode = sessionMode(seed, context, onEvent, options.reportFailure)
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
      mode: toSystemPromptMode(
        mode,
        chatArchive,
        createChatSummary(seed.pack.name).read,
        seed.start,
        seed.pack.name,
      ),
    }),
    start: seed.start,
    tag,
    onSessionMarked: (sessionId) => options.onSessionMarked(sessionId, tag),
    mode,
    inheritedEnv,
    claudeConfigDir: options.claudeConfigDir,
    mountWorkflowPlugin: options.mountWorkflowPlugin,
    // 段に入るたびに読み直す（見直しの途中で見送りが増えても効く）。
    dismissedUsageProposalKeys: () => readDismissedUsageProposalKeys(),
    hasTaskOperation: async () => (await readBeadsWorkspace(cwd)).kind === "found",
    onEvent,
    reportFailure: (error) =>
      options.reportFailure({ feature: "session", place: "event-handler" }, error),
    now: context.now,
    reportPromptDelay: options.reportPromptDelay,
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
 * そのモードのときだけ渡る口を1回の分岐でまとめる。
 * 思い出す口（`recall` / `recall_episode`）は両方のモードに渡る。
 * 覚えたことを書き換える口とあらすじの印の口は雑談だけで、仕事では `remember` / `forget` のツールが載らず、作業の文脈が人格に入らない。
 */
function sessionMode(
  seed: SessionLaunchSeed<CharacterPack>,
  context: WiringContext,
  onEvent: (event: SessionEvent) => void,
  reportFailure: (place: SwallowedFailurePlace, error: unknown) => void,
): SessionMode {
  const chatRecall = createChatRecall(context.chatArchive, seed.pack.name, context.now)
  if (!seed.chat) {
    return { kind: "work", chatRecall }
  }

  return {
    kind: "chat",
    // 書けた・消せたときだけ、更新後の一覧を画面へ流し直す。
    personaMemory: createPersonaMemory(
      seed.pack,
      context.cwd,
      undefined,
      (lines) => onEvent({ kind: "remembered-lines-changed", lines }),
      (place, error) => reportFailure({ feature: "chat", place }, error),
    ),
    chatSummary: createChatSummary(seed.pack.name),
    chatRecall,
  }
}
