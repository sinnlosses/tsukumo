// Agent SDK による本物のセッションドライバ。
// Claude Code を子プロセスとして起こし、届いたメッセージを内部イベントに変えて流す。
// ここは `query()` を回す本体で、外に出す型は core 側か shared から取る（SDK の語彙を外へ漏らさない）。
//
// セッションは1プロセスに1つ。起こし直したときは新規から始める。画面で選ばれたときだけ前の続きから始める（`resume`）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、ログにもファイルにも書かない。
// stderr に出すのは SDK 自身のエラー文と、Claude Code の催促が届いたという事実の1行（`isVisibleOutputNudge`。中身は写さない）だけ。

import { randomUUID, type UUID } from "node:crypto"

import { type PermissionResult, query } from "@anthropic-ai/claude-agent-sdk"

import { expressionNames as toExpressionNames } from "../../../shared/character-pack/expression-choice.ts"
import { parsePromptImage, type PromptImage } from "../../../shared/session-driver/prompt-image.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { createReportGate, type ReportGate } from "../../report/core/report-tool.ts"
import { asidePromptText } from "../core/aside-prompt.ts"
import { type CallReview, createCallReview, passRelayedEvents } from "../core/call-review.ts"
import { createClearAndSend } from "../core/clear-and-send.ts"
import { createExternalToolMark } from "../core/external-tool-mark.ts"
import { createInputLedgerIntake, type InputLedgerIntake } from "../core/input-ledger.ts"
import { createInterruptMark, type InterruptMark } from "../core/interrupt-mark.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "../core/pending-answer.ts"
import { createProgressNudge, progressNudgePromptText } from "../core/progress-nudge.ts"
import { createPromptDelayWatch, type PromptDelayWatch } from "../core/prompt-delay.ts"
import { handOffPrompt } from "../core/prompt-handoff.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import { isSubagentMessage, toSessionEvents } from "../core/sdk-message.ts"
import { withSelfStartedTurns } from "../core/self-started-turn.ts"
import type { SessionDriver, SessionDriverOptions } from "../core/session-driver.ts"
import { createSessionEnding } from "../core/session-ending.ts"
import { createSessionTitleIntake, type SessionTitleIntake } from "../core/session-title.ts"
import { TSUKUMO_MCP_SERVER_NAME } from "../core/tsukumo-tool-name.ts"
import { isVisibleOutputNudge } from "../core/visible-output-nudge.ts"
import { appendInputLedger } from "./input-ledger-file.ts"
import { createRtkRewrite } from "./rtk-rewrite.ts"
import { runAskGuard, withAskGuard } from "./sdk-ask-guard.ts"
import { readContextUsage } from "./sdk-context-usage.ts"
import { runLapHook, withLapHook } from "./sdk-lap-hook.ts"
import { readPlanUsage } from "./sdk-plan-usage.ts"
import { createPromptStream, type PromptContentBlock } from "./sdk-prompt-stream.ts"
import {
  buildQuerySeedOptions,
  handbackNoteHooks,
  preToolUseHooks,
  stopHooks,
} from "./sdk-query-seed.ts"
import {
  relayCommandDescriptions,
  relayPlan,
  relaySupportedModels,
} from "./sdk-session-metadata.ts"
import {
  createSessionTitleWriter,
  createSessionDigestReader,
  markSession,
  type SessionTitleWriter,
} from "./sdk-session.ts"
import { tsukumoServer } from "./sdk-tool.ts"

/**
 * Claude Code の催促が届いたときに stderr へ出す1行。固定の文面だけ（届いたメッセージの中身は写さない）。
 * 出たら `CLAUDE_CODE_TERMINAL_MCP_TOOLS` が Claude Code の更新で効かなくなっている（`isVisibleOutputNudge`）。
 */
const VISIBLE_OUTPUT_NUDGE_NOTICE =
  "tsukumo: Claude Code が「本文の無い応答」の催促を差し込んだ（CLAUDE_CODE_TERMINAL_MCP_TOOLS が効いていない）\n"

/**
 * Agent SDK の駆動を1つ起こす。
 * この関数は待たない（`query()` の反復はバックグラウンドで回り続け、結果は `onEvent` に流れる）。
 * 覚えた既定を読む・見張りを起こす・履歴を復元するといった一続きの段取りは持たない（`createSessionLaunch` が持つ）。
 * 反復が例外で終わったら `session-ended` を流すだけで、プロセスは落とさない。
 */
export function startSdkDriver(given: SessionDriverOptions): SessionDriver {
  // 駆動が送り出すイベントは全部ここを通す（依頼も SDK 由来も）。
  // claude が依頼なしで始めた続きのターンに `turn-started` を補うのに、依頼で開いたターンも見ている必要がある（`withSelfStartedTurns`）。
  const ending = createSessionEnding(given.onEvent, given.reportFailure)
  const clearAndSend = createClearAndSend()
  const progressNudge = watchProgressNudge(given.now, (summary) => {
    sendProgressNudge(summary)
  })
  const deliver = (event: SessionEvent): void => {
    progressNudge.observe(event)
    if (event.kind === "delegate-progress" || event.kind === "progress-nudged") {
      return
    }
    if (event.kind === "turn-finished") {
      queue.dropBrief()
    }
    if (event.kind === "session-ended") {
      clearAndSend.discard()
    }
    ending.deliver(event)
    if (event.kind === "turn-finished") {
      // 預かりは取り出した時点で空になるので、`/clear` 自身のターンの終わりでは何も送らない。
      for (const text of clearAndSend.take({
        outcome: event.outcome,
        pendingCount: queue.list().length,
      })) {
        sendRequest(text)
      }
    }
  }
  const options: SessionDriverOptions = { ...given, onEvent: withSelfStartedTurns(deliver) }
  const delayWatch = createPromptDelayWatch(given.reportPromptDelay)
  const input = createPromptStream(delayWatch, given.now)
  const queue = createPendingAnswerQueue({
    onChange: (pending) => {
      options.onEvent({ kind: "pending-changed", pending })
    },
    onAnswered: (toolUseId, questions, answers, { briefed, sentBack }) => {
      options.onEvent({
        kind: "question-answered",
        toolUseId,
        questions,
        answers,
        briefed,
        sentBack,
      })
    },
  })

  const callReview = createCallReview()
  const externalToolMark = createExternalToolMark()
  const reportGate = createReportGate(callReview.nothingNewRejected, callReview.backgroundRunning)
  const readSessionDigest = createSessionDigestReader(options.expressions)
  const titleIntake = createSessionTitleIntake()
  const titleWriter = createSessionTitleWriter()

  const session = query({
    prompt: input.stream(),
    options: {
      ...buildQuerySeedOptions(options),
      hooks: withLapHook(
        withAskGuard(
          {
            ...stopHooks(options.mode, reportGate, options.onEvent, options.reportGateBlock),
            ...preToolUseHooks(
              callReview.gateRaised,
              callReview.bandPosition,
              options.onEvent,
              externalToolMark,
              createRtkRewrite(),
              options.mode.kind === "work" ? callReview.planMissing : undefined,
            ),
            ...handbackNoteHooks(callReview, options.reportHandbackHeadMismatch),
          },
          options.mountWorkflowPlugin,
          runAskGuard,
          options.reportWorkflowTwFailure,
        ),
        options.mountWorkflowPlugin,
        runLapHook,
        options.reportWorkflowTwFailure,
      ),
      mcpServers: {
        [TSUKUMO_MCP_SERVER_NAME]: tsukumoServer(
          options.expressions,
          options.mode,
          callReview,
          titleIntake.note,
          options.cwd,
          options.onEvent,
          queue.holdBrief,
          clearAndSend.hold,
          externalToolMark.allowsRemember,
        ),
      },
      canUseTool: (toolName, toolInput, { signal, toolUseID }) =>
        askForAnswer(queue, toolUseID, toolName, toolInput, signal),
    },
  })

  const interruptMark = createInterruptMark()

  // 依頼も差し戻しに見せる（新しい事実の届いた印。`CallReview`）。
  const emitTurnOpening = (event: SessionEvent): void => {
    interruptMark.observe(event)
    externalToolMark.observe(event)
    for (const passed of callReview.pass(event)) {
      options.onEvent(passed)
    }
  }

  const ledgerIntake = createInputLedgerIntake()
  const push = (text: string, images: readonly PromptContentBlock[]): UUID => {
    const uuid = randomUUID()
    input.push({ text, images, uuid })
    return uuid
  }

  const sendRequest = (text: string): void => {
    emitTurnOpening({ kind: "request", text, images: [] })
    delayWatch.pushed(options.now())
    ledgerIntake.noteSent(push(text, []), "request")
  }

  // 依頼を流さない（差し込みは利用者の発言ではない）。ターンの始まりは続く `init` から `turn-resumed` が補う。
  const sendProgressNudge = (summary: string): void => {
    if (ending.ended()) {
      return
    }
    emitTurnOpening({ kind: "progress-nudged" })
    delayWatch.pushed(options.now())
    ledgerIntake.noteSent(push(progressNudgePromptText(summary), []), "progress-nudge")
  }

  void applyNeutralOutputStyle(session)
  void relayMessages(
    session,
    options,
    reportGate,
    callReview,
    titleIntake,
    titleWriter,
    delayWatch,
    interruptMark,
    ledgerIntake,
  )
  void relayCommandDescriptions(session, options)
  void relayPlan(session, options)
  void relaySupportedModels(session, options)
  // 起こした effort は `query()` に渡した値なので、最初のターンが終わるのを待たずに出す。
  options.onEvent({ kind: "effort-changed", effort: options.effort })

  return {
    prompt: (text, images, opening) => {
      clearAndSend.discard()
      // 控えと id だけが記録（`request` / `aside`）へ行き、原寸は入力のストリームへ流れる（棚の分は棚の寿命で捨てる）。
      const uuid = handOffPrompt({
        now: options.now,
        watch: delayWatch,
        push: () =>
          push(opening === "aside" ? asidePromptText(text) : text, images.flatMap(toImageBlocks)),
        record: () =>
          emitTurnOpening({ kind: opening, text, images: recordedPromptImages(images) }),
      })
      ledgerIntake.noteSent(uuid, opening)
    },
    promptWithoutRecord: (text) => {
      // `request` を流さない（送った文面をログにも記録にも残さない）。
      // 代わりにターンの始まりだけを流し、吹き出しと進行中の印は依頼と同じに動かす。
      emitTurnOpening({ kind: "turn-started" })
      delayWatch.pushed(options.now())
      push(text, [])
    },
    interrupt: async () => {
      delayWatch.discard()
      interruptMark.send()
      await session.interrupt()
    },
    answer: (id, answer) => queue.answer(id, answer),
    pending: () => queue.list(),
    readContextUsage: () => readContextUsage(session, options.reportUsageFailure),
    readPlanUsage: () => readPlanUsage(session, options.reportUsageFailure),
    readSessionDigest,
    setModel: async (model) => {
      await session.setModel(model)
      // サイドバーの `<select>` は `state.model` をそのまま出すので、ここで確認の合図を出さないと次のターンの `init` まで古い値に居座る。
      if (model !== undefined) {
        options.onEvent({ kind: "model-changed", model })
      }
    },
    // SDK が受け付けたら、その値を確認の合図として流す（`setModel` と同じ）。
    setEffort: async (effort) => {
      await session.applyFlagSettings({ effortLevel: effort })
      options.onEvent({ kind: "effort-changed", effort })
    },
    setPermissionMode: async (mode) => {
      await session.setPermissionMode(mode)
      options.onEvent({ kind: "permission-mode-changed", mode })
    },
    ended: ending.ended,
    close: () => {
      progressNudge.close()
      delayWatch.discard()
      queue.settleAll()
      input.end()
      session.close()
    },
  }
}

/**
 * 進みの差し込み（`ProgressNudge`）に時計とタイマーを付ける。
 * タイマーは時計より少し早く発火することがあり、そのときは `take` が何も返さないので、残りの分だけ立て直す。
 */
function watchProgressNudge(
  now: () => number,
  send: (summary: string) => void,
): { readonly observe: (event: SessionEvent) => void; readonly close: () => void } {
  const nudge = createProgressNudge()
  let armedAt: number | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const rearm = (): void => {
    const due = nudge.due()
    const nextAt = due.kind === "at" ? due.at : undefined
    if (nextAt === armedAt) {
      return
    }
    clearTimeout(timer)
    armedAt = nextAt
    timer = nextAt === undefined ? undefined : setTimeout(ring, Math.max(0, nextAt - now()))
  }
  const ring = (): void => {
    armedAt = undefined
    timer = undefined
    const taken = nudge.take(now())
    if (taken.kind === "nudge") {
      send(taken.summary)
    }
    rearm()
  }

  return {
    observe: (event) => {
      nudge.observe(event, now())
      rearm()
    },
    close: () => {
      clearTimeout(timer)
      armedAt = undefined
      timer = undefined
    },
  }
}

/**
 * 届いたメッセージを内部イベントに変えて流し続ける。
 * 反復を包む `try`/`catch` はここだけで、反復が終わる・落ちるのどちらもセッションの終わりとして扱う。
 *
 * `report` の関所（`reportGate`）にはメインのメッセージから出たイベントだけを見せる。
 * サブエージェントの本文を数えない。関所を登録していないときも見せるが、判定されないだけ。
 *
 * メインのイベントと、委譲先のメッセージから出た返却は `CallReview` を通す（`passRelayedEvents`）。
 * 呼び出しは同じ呼び出しの結果まで預かり、差し戻した呼び出しを描かない。
 *
 * `titleIntake` が覚えている題（`report` の `title` 引数）もターンの終わりに取り出し、`titleWriter` で書く。
 * 入力の控え（`ledgerIntake`）もメインのメッセージを見て、ターンの終わりに書く。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
  reportGate: ReportGate,
  callReview: CallReview,
  titleIntake: SessionTitleIntake,
  titleWriter: SessionTitleWriter,
  delayWatch: PromptDelayWatch,
  interruptMark: InterruptMark,
  ledgerIntake: InputLedgerIntake,
): Promise<void> {
  // セッションIDは `session-info`（ターンのたびに届く）から取り、ターンが終わるたびに印を付け直す（`markSession`）。
  let sessionId: string | undefined = undefined
  try {
    for await (const message of session) {
      const fromMain = !isSubagentMessage(message)
      if (fromMain) {
        delayWatch.received(options.now())
        ledgerIntake.observe(message)
      }
      // 環境変数が効かなくなったことに気づくための1行。届いた事実だけで、中身は写さない。
      if (fromMain && isVisibleOutputNudge(message)) {
        process.stderr.write(VISIBLE_OUTPUT_NUDGE_NOTICE)
      }
      const converted = toSessionEvents(
        message,
        toExpressionNames(options.expressions),
        interruptMark.sent(),
      )
      const events = passRelayedEvents(callReview, converted, fromMain)
      for (const event of events) {
        if (fromMain) {
          reportGate.observe(event)
        }
        if (event.kind === "session-info") {
          sessionId = event.sessionId
        }
        interruptMark.observe(event)
        if (event.kind === "turn-finished" && fromMain) {
          const ledgerEntry = ledgerIntake.finishTurn(message, event.outcome)
          if (ledgerEntry !== undefined) {
            appendInputLedger(ledgerEntry)
          }
        }
        if (event.kind === "turn-finished") {
          // 1ターンに書けるのは1行、引けるのは recall / recall_episode それぞれ決めた回数まで。
          // ターンの区切りを知っているのはここだけなので、終わるたびに次の1行・次の回数を受け付けさせる。
          options.mode.chatRecall.finishTurn()
          if (options.mode.kind === "chat") {
            options.mode.personaMemory.finishTurn()
          }
          if (sessionId !== undefined) {
            void markSession(sessionId, options)
            const title = titleIntake.take()
            if (title !== undefined) {
              void titleWriter.write(sessionId, title, options)
            }
          }
        }
        if (event.kind === "conversation-cleared") {
          // `/clear` を見た合図。写しの印を「未渡し」に戻す。
          // 印はターンが終わるたびにそのときのセッションIDへ付け直されるので、`/clear` のあと1ターン回すと空のほうが印を持つ。
          // ここで戻さないと、次に起こしたとき記憶が二度と戻らない。
          if (options.mode.kind === "chat") {
            options.mode.chatSummary.markUndelivered()
          }
          titleWriter.noteConversationCleared()
        }
        options.onEvent(event)
      }
    }
    options.onEvent({ kind: "session-ended", reason: "セッションが終了した" })
  } catch (error) {
    options.onEvent({ kind: "session-ended", reason: describeError(error) })
  }
}

/**
 * グローバルの出力スタイル（`~/.claude/settings.json` の `outputStyle`）をこのセッションの中だけ中立に戻す。
 * そうしないと人格が二重に効く（パックの `persona.md` と、全プロジェクトに効く出力スタイルが重なる。実測: 応答が両方の人格を名乗った）。
 *
 * 触るのはセッション限りのフラグ層だけで、設定ファイルは書き換えない（`updateSettings` のほうはファイルを書くので使わない）。
 * 失敗しても続行する。人格が二重になるだけで、セッション自体は動く。
 */
async function applyNeutralOutputStyle(session: {
  readonly applyFlagSettings: (settings: { readonly outputStyle: string }) => Promise<void>
}): Promise<void> {
  try {
    await session.applyFlagSettings({ outputStyle: "default" })
  } catch {
    // 中立に戻せなかっただけなので、何も流さずに諦める。
  }
}

/**
 * 許可要求と質問を答え待ちの列へ回す。
 * `canUseTool` の戻り値の型（`PermissionResult`）に合わせるのはここだけで、列の側は SDK を知らない（構造は一致している）。
 */
function askForAnswer(
  queue: PendingAnswerQueue,
  id: string,
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<PermissionResult> {
  return queue.ask({ id, toolName, input, signal })
}

/**
 * 依頼に添えられた画像1枚を、モデルへ渡す内容ブロックにする。
 * 渡せない形・大きすぎるものは空（その1枚を諦めて依頼そのものは送る）。
 * 形は境界（契約の zod）で見てあるので、ここは同じ関数でほどくだけ。
 */
function toImageBlocks(image: PromptImage): readonly PromptContentBlock[] {
  const source = parsePromptImage(image.full)
  return source === undefined
    ? []
    : [
        {
          type: "image",
          source: { type: "base64", media_type: source.mediaType, data: source.base64 },
        },
      ]
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}
