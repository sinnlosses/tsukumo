// Agent SDK による本物のセッション駆動。
// Claude Code を子プロセスとして起こし、届いたメッセージを内部イベントに変えて流す。
// ここは `query()` を回す本体で、外に出す型は core 側か shared から取る（SDK の語彙を外へ漏らさない）。
//
// セッションは1プロセスに1つ。起こし直したときは前の続きから始める（`resume`）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、ログにもファイルにも書かない。
// stderr に出すのは SDK 自身のエラー文と、本体の催促が届いたという事実の1行（`isVisibleOutputNudge`。中身は写さない）だけ。

import { type PermissionResult, query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import { expressionNames as toExpressionNames } from "../../../shared/character-pack/expression-choice.ts"
import { parsePromptImage, type PromptImage } from "../../../shared/session-driver/prompt-image.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { createReportReview } from "../../report/core/report-review.ts"
import { createReportGate, type ReportGate } from "../../report/core/report-tool.ts"
import { createUsageReviewIntake } from "../../usage-review/core/usage-review-tool.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "../core/pending-answer.ts"
import { type ClaudeAccountTier, planName } from "../core/plan.ts"
import { createPromptDelayWatch, type PromptDelayWatch } from "../core/prompt-delay.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import { isSubagentMessage, toSessionEvents } from "../core/sdk-message.ts"
import { toCommandDescriptions, toModelEffortSupport, toPlan } from "../core/sdk-query-reply.ts"
import { withSelfStartedTurns } from "../core/self-started-turn.ts"
import type { SessionDriver, SessionDriverOptions } from "../core/session-driver.ts"
import { createSessionEnding } from "../core/session-ending.ts"
import { createSessionTitleIntake, type SessionTitleIntake } from "../core/session-title.ts"
import { createSpeechReview } from "../core/speech-review.ts"
import { TSUKUMO_MCP_SERVER_NAME } from "../core/tsukumo-tool-name.ts"
import { isVisibleOutputNudge } from "../core/visible-output-nudge.ts"
import { createWorkPlanReview, type WorkPlanReview } from "../core/work-plan-review.ts"
import { readClaudeAccountTier } from "./claude-account.ts"
import { readContextUsage } from "./sdk-context-usage.ts"
import { readPlanUsage } from "./sdk-plan-usage.ts"
import { buildQuerySeedOptions, stopHooks } from "./sdk-query-seed.ts"
import {
  createSessionTitleWriter,
  createSessionDigestReader,
  scheduleMarkSession,
  type SessionTitleWriter,
} from "./sdk-session.ts"
import { tsukumoServer } from "./sdk-tool.ts"

/**
 * 本体の催促が届いたときに stderr へ出す1行。固定の文面だけ（届いたメッセージの中身は写さない）。
 * 出たら `CLAUDE_CODE_TERMINAL_MCP_TOOLS` が本体の更新で効かなくなっている（`isVisibleOutputNudge`）。
 */
export const VISIBLE_OUTPUT_NUDGE_NOTICE =
  "tsukumo: 本体が「本文の無い応答」の催促を差し込んだ（CLAUDE_CODE_TERMINAL_MCP_TOOLS が効いていない）\n"

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
  const options: SessionDriverOptions = { ...given, onEvent: withSelfStartedTurns(ending.deliver) }
  const delayWatch = createPromptDelayWatch(given.reportPromptDelay)
  const input = createPromptStream(delayWatch, given.now)
  const queue = createPendingAnswerQueue({
    onChange: (pending) => {
      options.onEvent({ kind: "pending-changed", pending })
    },
    onAnswered: (toolUseId, questions, answers) => {
      options.onEvent({ kind: "question-answered", toolUseId, questions, answers })
    },
  })

  const reportReview = createReportReview()
  const reportGate = createReportGate(reportReview.nothingNewRejected)
  const speechReview = createSpeechReview()
  // `speak` の差し戻しを `report` の差し戻しより先に通す（ターンの終わりに預かりを出す並びがセリフ → レポートになる）。
  const review = (event: SessionEvent): readonly SessionEvent[] =>
    speechReview.pass(event).flatMap((passed) => reportReview.pass(passed))
  const workPlanReview = createWorkPlanReview()
  const readSessionDigest = createSessionDigestReader(options.expressions)
  const usageReview = createUsageReviewIntake(
    options.dismissedUsageProposalKeys,
    options.hasTaskOperation,
    options.onEvent,
  )
  const titleIntake = createSessionTitleIntake()
  const titleWriter = createSessionTitleWriter()

  const session = query({
    prompt: input.stream(),
    options: {
      ...buildQuerySeedOptions(options),
      hooks: stopHooks(options.mode, reportGate, options.onEvent),
      mcpServers: {
        [TSUKUMO_MCP_SERVER_NAME]: tsukumoServer(
          options.expressions,
          options.mode,
          reportReview,
          speechReview,
          workPlanReview,
          usageReview,
          titleIntake.note,
          options.cwd,
        ),
      },
      canUseTool: (toolName, toolInput, { signal, toolUseID }) =>
        askForAnswer(queue, toolUseID, toolName, toolInput, signal),
    },
  })

  // 依頼も差し戻しに見せる（新しい事実の届いた印。`SpeechReview` / `ReportReview`）。
  const emitTurnOpening = (event: SessionEvent): void => {
    for (const passed of review(event).flatMap(workPlanReview.pass)) {
      options.onEvent(passed)
    }
  }

  void applyNeutralOutputStyle(session)
  void relayMessages(
    session,
    options,
    reportGate,
    review,
    workPlanReview,
    titleIntake,
    titleWriter,
    delayWatch,
  )
  void relayCommandDescriptions(session, options)
  void relayPlan(session, options)
  void relaySupportedModels(session, options)
  // 起こした effort は `query()` に渡した値なので、最初のターンが終わるのを待たずに出す。
  options.onEvent({ kind: "effort-changed", effort: options.effort })

  return {
    prompt: (text, images) => {
      // 原寸と控えはここで分かれる。
      // 控えと id だけが記録（`request`）へ行き、原寸はストリーミング入力へ流れる（棚に残っているぶんは棚の寿命で捨てる）。
      emitTurnOpening({ kind: "request", text, images: recordedPromptImages(images) })
      delayWatch.pushed(options.now())
      input.push({ text, images: images.flatMap(toImageBlocks) })
    },
    promptWithoutRecord: (text) => {
      // `request` を流さない（送った文面をログにも記録にも残さない）。
      // 代わりにターンの始まりだけを流し、吹き出しと進行中の印は依頼と同じに動かす。
      emitTurnOpening({ kind: "turn-started" })
      delayWatch.pushed(options.now())
      input.push({ text, images: [] })
    },
    interrupt: async () => {
      delayWatch.discard()
      await session.interrupt()
    },
    answer: (id, answer) => queue.answer(id, answer),
    pending: () => queue.list(),
    readContextUsage: () => readContextUsage(session),
    readPlanUsage: () => readPlanUsage(session),
    readSessionDigest,
    setModel: async (model) => {
      await session.setModel(model)
      // サイドバーの `<select>` は `state.model` をそのまま出すので、ここで確認の合図を出さないと次のターンの `init` まで古い値に居座る。
      // `/model` チャットコマンドの `model-changed` を、駆動が確定させた切り替えにもそのまま使う。
      if (model !== undefined) {
        options.onEvent({ kind: "model-changed", model })
      }
    },
    // SDK が受け付けたら、その値を確認の合図として流す（`setModel` と同じ）。
    // 次のターンの `Stop` フック入力から読んだ値が届けば、そちらで上書きされる。
    setEffort: async (effort) => {
      await session.applyFlagSettings({ effortLevel: effort })
      options.onEvent({ kind: "effort-changed", effort })
    },
    setPermissionMode: (mode) => session.setPermissionMode(mode),
    ended: ending.ended,
    close: () => {
      delayWatch.discard()
      queue.settleAll()
      input.end()
      session.close()
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
 * メインのイベントは先に `speak` と `report` の差し戻し（`review`）を通す。
 * どちらも同じ呼び出しの結果まで預かり、差し戻した呼び出しを描かない。
 * 段の一足飛び（`workPlanReview`）にはメインとサブエージェントの両方のイベントを通す（委譲の合図はサブエージェントから出る）。
 *
 * `titleIntake` が覚えている題（`report` の `title` 引数）もターンの終わりに取り出し、`titleWriter` に書く予約をする。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
  reportGate: ReportGate,
  review: (event: SessionEvent) => readonly SessionEvent[],
  workPlanReview: WorkPlanReview,
  titleIntake: SessionTitleIntake,
  titleWriter: SessionTitleWriter,
  delayWatch: PromptDelayWatch,
): Promise<void> {
  // セッションIDは `session-info`（ターンのたびに届く）から取り、ターンが終わるたびに印を付け直す（`scheduleMarkSession`）。
  let sessionId: string | undefined = undefined
  try {
    for await (const message of session) {
      const fromMain = !isSubagentMessage(message)
      if (fromMain) {
        delayWatch.received(options.now())
      }
      // 環境変数が効かなくなったことに気づくための1行。届いた事実だけで、中身は写さない。
      if (fromMain && isVisibleOutputNudge(message)) {
        process.stderr.write(VISIBLE_OUTPUT_NUDGE_NOTICE)
      }
      const converted = toSessionEvents(message, toExpressionNames(options.expressions))
      const events = (fromMain ? converted.flatMap((event) => review(event)) : converted).flatMap(
        workPlanReview.pass,
      )
      for (const event of events) {
        if (fromMain) {
          reportGate.observe(event)
        }
        if (event.kind === "session-info") {
          sessionId = event.sessionId
        }
        if (event.kind === "turn-finished") {
          // 1ターンに書けるのは1行、引けるのは recall / recall_episode それぞれ決めた回数まで。
          // ターンの区切りを知っているのはここだけなので、終わるたびに次の1行・次の回数を受け付けさせる。
          options.mode.chatRecall.finishTurn()
          if (options.mode.kind === "chat") {
            options.mode.personaMemory.finishTurn()
          }
          if (sessionId !== undefined) {
            scheduleMarkSession(sessionId, options)
            const title = titleIntake.take()
            if (title !== undefined) {
              titleWriter.schedule(sessionId, title, options)
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
 * コマンドの説明を1回だけ取りに行く。
 * `init` の `slash_commands` は名前だけなので、説明はこの制御リクエストから受け取る（組み込みコマンドの分も返る）。
 * 以降セッション中に増減したときは `commands_changed` が押してくる（`toCommandDescriptions`）。
 * 取れなくてもセッションは続ける（説明が無いまま名前だけの補完に戻るだけ）。
 */
async function relayCommandDescriptions(
  session: { readonly supportedCommands: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const descriptions = toCommandDescriptions(await session.supportedCommands())
    if (descriptions.length > 0) {
      options.onEvent({ kind: "command-descriptions", descriptions })
    }
  } catch {
    // 説明が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * プランを1回だけ取りに行く。
 * `accountInfo()` は `email` / `organization` も返すが、駆動の外へ出すのは `toPlan` が取り出した `subscriptionType` だけ。
 *
 * 名前は Claude Code の控えを先に見て決める（`planName`）。
 * SDK の `subscriptionType` は契約の段と合わないことがあり、控えのほうが段と枠を別々に持つ。
 * 控えから決まらなければ SDK の値をそのまま出す。
 *
 * 取れなくてもセッションは続ける（API キーや Bedrock のときは元々この値が無い）。
 */
async function relayPlan(
  session: { readonly accountInfo: () => Promise<unknown> },
  options: SessionDriverOptions,
  readTier: () => ClaudeAccountTier = () => readClaudeAccountTier(options.claudeConfigDir),
): Promise<void> {
  try {
    const plan = planName(readTier(), toPlan(await session.accountInfo()))
    if (plan !== undefined) {
      options.onEvent({ kind: "plan", plan })
    }
  } catch {
    // プランが取れないだけなので、何も流さずに諦める。
  }
}

/**
 * モデルごとの effort の対応（`ModelEffortSupport`）を `supportedModels()` から1回だけ取りに行く。
 * 取れなくても・空でもセッションは続ける（画面は effort を「対応するかどうか分からない」のまま扱うだけ）。
 */
async function relaySupportedModels(
  session: { readonly supportedModels: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const models = toModelEffortSupport(await session.supportedModels())
    if (models.length > 0) {
      options.onEvent({ kind: "model-effort-support", models })
    }
  } catch {
    // 対応が取れないだけなので、何も流さずに諦める。
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
 * 送る依頼1件。
 * 駆動が持つ原寸の画像はここまでで、`stream()` が渡したあとは持たない（拡大表示のために残すのは棚の側）。
 */
type Prompt = {
  readonly text: string
  readonly images: readonly PromptContentBlock[]
}

/** user メッセージの内容ブロック1つ。`MessageParam` の型をそのまま使う（自前の型を作らない）。 */
type PromptContentBlock = Extract<SDKUserMessage["message"]["content"], readonly unknown[]>[number]

/**
 * ストリーミング入力。
 * `query` には「まだ終わらない」非同期イテレータを渡し、依頼が届くたびに user メッセージを1つ流す。
 *
 * 画像を添えられるのはストリーミング入力だけ（単発入力は受け付けない）。
 * 添えたときは `content` を配列にし、画像のブロックを先に、文面を後ろに置く。
 */
function createPromptStream(
  delayWatch: PromptDelayWatch,
  now: () => number,
): {
  readonly push: (prompt: Prompt) => void
  readonly end: () => void
  readonly stream: () => AsyncIterable<SDKUserMessage>
} {
  const waiting: Prompt[] = []
  let wake: (() => void) | undefined = undefined
  let closed = false

  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }

  return {
    push: (prompt) => {
      waiting.push(prompt)
      notify()
    },
    end: () => {
      closed = true
      notify()
    },
    stream: async function* () {
      while (true) {
        const prompt = waiting.shift()
        if (prompt === undefined) {
          if (closed) {
            return
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        yield {
          type: "user",
          message: { role: "user", content: promptContent(prompt) },
          parent_tool_use_id: null,
          session_id: "",
        }
        delayWatch.written(now())
      }
    },
  }
}

/** 依頼1件の `content`。画像が無ければ文字列のまま。 */
function promptContent(prompt: Prompt): SDKUserMessage["message"]["content"] {
  return prompt.images.length === 0
    ? prompt.text
    : [...prompt.images, { type: "text", text: prompt.text }]
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
