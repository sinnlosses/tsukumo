// Agent SDK による本物のセッション駆動。Claude Code を子プロセスとして起こし、届いた
// メッセージを内部イベントに変えて流す（`src/server/core/session-driver.ts` の `SessionDriver` を
// 実装する2つのうちの本物。もう1つは `src/server/adapter/fake-driver.ts`）。
//
// **`@anthropic-ai/claude-agent-sdk` を import するのは `src/server/adapter/` 直下の `sdk-` で
// 始まるファイルだけ**（原則3。`orca` を呼ぶのが src/server/host/adapter/orca-host.ts だけなのと同じ
// 扱いで、SDK という1つの境界が数ファイルにまたがる）。ここは `query()` を回す本体で、ツールは
// `sdk-tool.ts`、セッションの一覧と印は `sdk-session.ts`、コンテキストの内訳は
// `sdk-context-usage.ts`。SDK の語彙を外へ漏らさないため、どれも外に出す型は
// `src/server/core/session-driver.ts` か shared から取る（**境目の基準は「shared の語彙で
// 書けるか / SDK の語彙を名乗るか」**）。
//
// **セッションは1プロセスに1つ**。起こし直したときは前の続きから始める（`resume`。
// docs/requirements.md 4.8「セッションの復元」。選ぶ計算は src/server/core/session-restore.ts）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。stderr に出すのは SDK 自身のエラー文と、本体の
// 催促が届いたという事実の1行（`src/server/core/visible-output-nudge.ts`。中身は写さない）だけ。

import { setImmediate } from "node:timers/promises"

import {
  type HookCallbackMatcher,
  type HookEvent,
  type PermissionResult,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"

import { type EffortLevel, isEffortLevel, type PermissionMode } from "../../shared/command.ts"
import { expressionNames as toExpressionNames } from "../../shared/expression-choice.ts"
import { parsePromptImage, type PromptImage } from "../../shared/prompt-image.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { readChatTopics } from "../core/chat-compact.ts"
import {
  createDiaryIntake,
  createDiaryStageTracker,
  DIARY_TOOL_NAME,
  type DiaryIntake,
  type DiaryStageTracker,
} from "../core/diary-tool.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "../core/pending-answer.ts"
import { type ClaudeAccountTier, planName } from "../core/plan.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import {
  isSubagentMessage,
  toCommandDescriptions,
  toModelEffortSupport,
  toPlan,
  toSessionEvents,
  tsukumoToolFullName,
  TSUKUMO_MCP_SERVER_NAME,
} from "../core/sdk-message.ts"
import { withSelfStartedTurns } from "../core/self-started-turn.ts"
import {
  type SessionDriver,
  type SessionDriverOptions,
  type SessionMode,
} from "../core/session-driver.ts"
import { createSessionTitleIntake, type SessionTitleIntake } from "../core/session-title.ts"
import { childProcessEnv, isVisibleOutputNudge } from "../core/visible-output-nudge.ts"
import { createReportReview, type ReportReview } from "../report/core/report-review.ts"
import { createReportGate, type ReportGate } from "../report/core/report-tool.ts"
import { createUsageReviewIntake } from "../usage-review/core/usage-review-tool.ts"
import { readClaudeAccountTier } from "./claude-account.ts"
import { appendDiaryParagraph } from "./diary.ts"
import { readContextUsage } from "./sdk-context-usage.ts"
import {
  createSessionTitleWriter,
  scheduleMarkSession,
  type SessionTitleWriter,
} from "./sdk-session.ts"
import { tsukumoServer } from "./sdk-tool.ts"

/**
 * 本体の催促が届いたときに stderr へ出す1行。**固定の文面だけ**（届いたメッセージの中身は
 * 写さない）。出たら `CLAUDE_CODE_TERMINAL_MCP_TOOLS` が本体の更新で効かなくなっている
 * （`src/server/core/visible-output-nudge.ts` の冒頭）。
 */
export const VISIBLE_OUTPUT_NUDGE_NOTICE =
  "tsukumo: 本体が「本文の無い応答」の催促を差し込んだ（CLAUDE_CODE_TERMINAL_MCP_TOOLS が効いていない）\n"

/**
 * Agent SDK の駆動を1つ起こす（`docs/glossary.md`「セッション駆動」の実装）。**この関数は
 * 待たない**（`query()` の反復はバックグラウンドで回り続け、結果は `onEvent` に流れる）。
 *
 * **名前が `startSession` ではなく `startSdkDriver` なのは、`src/session-start.ts` の
 * `startSession`（セッションを1つ起こす配線）と役割が違うから** — こちらは駆動を1つ起こす
 * だけで、覚えた既定を読む・見張りを起こす・履歴を復元するといった一続きの段取りは持たない
 * （その段取りは `core/session-launch.ts`）。
 *
 * 反復が例外で終わったら `session-ended` を流すだけで、**プロセスは落とさない**
 * （docs/coding-standards.md「エラーハンドリング」）。`try`/`catch` は反復を包む1つだけに
 * まとめてある。
 */
export function startSdkDriver(given: SessionDriverOptions): SessionDriver {
  // **駆動が送り出すイベントは全部ここを通す**（依頼も SDK 由来も）。claude が依頼なしで
  // 始めた続きのターンに `turn-started` を補うのに、依頼で開いたターンも見ている必要がある
  // （`src/server/core/self-started-turn.ts`）。
  const options: SessionDriverOptions = { ...given, onEvent: withSelfStartedTurns(given.onEvent) }
  const input = createPromptStream()
  const queue = createPendingAnswerQueue({
    onChange: (pending) => {
      options.onEvent({ kind: "pending-changed", pending })
    },
    onAnswered: (questions, answers) => {
      options.onEvent({ kind: "question-answered", questions, answers })
    },
  })

  const reportGate = createReportGate()
  const reportReview = createReportReview()
  const usageReview = createUsageReviewIntake(options.dismissedUsageProposalKeys, options.onEvent)
  const diaryIntake = createDiaryIntake(
    () => Temporal.Now.instant().epochMilliseconds,
    (paragraph) => appendDiaryParagraph(options.cwd, { ...paragraph, writer: options.diaryWriter }),
    options.onEvent,
  )
  // **駆動の世代に1つ**（`docs/design.md`「日記の受け取りと保存」「3段の進みの決まり方」）。
  const diaryStageTracker = createDiaryStageTracker(tsukumoToolFullName(DIARY_TOOL_NAME))
  const titleIntake = createSessionTitleIntake()
  const titleWriter = createSessionTitleWriter()

  const session = query({
    prompt: input.stream(),
    options: {
      ...buildQuerySeedOptions(options),
      // `PostCompact` は雑談のときだけ、`Stop` はモードによらず常に登録する
      // （{@link stopHooks}。effort を読む口は仕事でも雑談でも要るため）。
      hooks: {
        ...chatSummaryHooks(options.mode, options.onEvent),
        ...stopHooks(options.mode, reportGate, options.onEvent),
      },
      mcpServers: {
        [TSUKUMO_MCP_SERVER_NAME]: tsukumoServer(
          options.expressions,
          options.mode,
          reportReview,
          usageReview,
          diaryIntake,
          titleIntake.note,
        ),
      },
      canUseTool: (toolName, toolInput, { signal, toolUseID }) =>
        askForAnswer(queue, toolUseID, toolName, toolInput, signal),
    },
  })

  void applyNeutralOutputStyle(session)
  void relayMessages(
    session,
    options,
    reportGate,
    reportReview,
    titleIntake,
    titleWriter,
    diaryStageTracker,
    diaryIntake,
  )
  void relayCommandDescriptions(session, options)
  void relayPlan(session, options)
  void relaySupportedModels(session, options)

  return {
    prompt: (text, images) => {
      // **原寸と控えはここで分かれる。** 控えと id だけが記録（`request`）へ行き、原寸は
      // ストリーミング入力へ流れる（棚に残っているぶんは棚の寿命で捨てる。
      // `docs/requirements.md` 4.10）。
      options.onEvent({ kind: "request", text, images: recordedPromptImages(images) })
      input.push({ text, images: images.flatMap(toImageBlocks) })
    },
    promptWithoutRecord: (text) => {
      // **`request` を流さない**（送った文面をログにも記録にも残さない。docs/screen-design.md 13.7）。
      // 代わりにターンの始まりだけを流し、吹き出しと進行中の印は依頼と同じに動かす。
      options.onEvent({ kind: "turn-started" })
      input.push({ text, images: [] })
    },
    beginDiaryDay: (day) => {
      diaryIntake.beginDay(day)
    },
    interrupt: async () => {
      await session.interrupt()
    },
    answer: (id, answer) => queue.answer(id, answer),
    pending: () => queue.list(),
    readContextUsage: () => readContextUsage(session),
    setModel: async (model) => {
      await session.setModel(model)
      // サイドバーの `<select>` は `state.model` をそのまま出すので、ここで確認の合図を
      // 出さないと次のターンの `init` まで古い値に居座る（`/model` チャットコマンドのために
      // 足した `model-changed` を、駆動が確定させた切り替えにもそのまま使う。実測:
      // fake driver（fake-driver.ts）は最初からこれをやっていたが、本物の駆動は抜けていた）。
      if (model !== undefined) {
        options.onEvent({ kind: "model-changed", model })
      }
    },
    // **確認の合図をここで流さない**（`setModel` と違う）。帯に表示する値は次のターンの
    // `Stop` フック入力から読み取ったものだけで、送った値の先回りは「押した値へ先に倒さない」
    // という決定に反する（`docs/screen-design.md` 13.9「動き方の操作子」）。
    setEffort: (effort) => session.applyFlagSettings({ effortLevel: effort }),
    setPermissionMode: (mode) => session.setPermissionMode(mode),
    close: () => {
      input.end()
    },
  }
}

/** `query()` の `options` のうち、`mcpServers` / `canUseTool`（クロージャが要る）を除いた部分。 */
export type QuerySeedOptions = {
  readonly cwd: string
  readonly includePartialMessages: true
  readonly systemPrompt: {
    readonly type: "preset"
    readonly preset: "claude_code"
    readonly append: string
  }
  readonly permissionMode: PermissionMode
  readonly model: string
  readonly effort: EffortLevel
  /**
   * 続きから始めるセッションのID。新規に起こすときは undefined（SDK 側は省略と同じ扱い）。
   * **ここだけは `SessionDriverOptions.start`（判別可能な合併型）を `query()` 自身の語彙
   * （`resume?: string`）へ畳んだ値**——`query()` へそのまま渡す形を検査できるように
   * `buildQuerySeedOptions` を切り出してあるのと同じ理由で、この1箇所だけ外の世界（SDK）の
   * 形をそのまま写す（`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
   */
  readonly resume: string | undefined
  /**
   * ターンの最後の応答が空だと本体が差し込む催促（`[Your previous response had no visible
   * output. ...]`）への返事が、指定なしだと日本語の依頼でも英語に滑るための保険。値は固定で、
   * キャラクターパックや利用者から変える口は作らない。
   */
  readonly settings: { readonly language: "japanese" }
  /**
   * 子プロセスの環境変数。**渡すと tsukumo 自身の環境と混ざらず丸ごと置き換わる**ので、引き継いだ
   * 環境に `CLAUDE_CODE_TERMINAL_MCP_TOOLS` を足したもの（`childProcessEnv`）を渡す。
   * `speak` で終えたターンに本体が催促を差し込むのを止めるため（`docs/chat-mode.md` 4.9）。
   */
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * `query()` に渡す `options` のうち、クロージャを含まない部分を組み立てる。**本物の
 * `query()` を呼ばずに、覚えた既定（モデル・effort・許可モード）が渡る形を検査できるように、
 * `startSdkDriver` から切り出してある。**
 *
 * **モデル・effort・許可モードは呼び出し側から来る**（`src/session-start.ts` が
 * `readRememberedSessionDefault` で読んだ値。`docs/screen-design.md` 13.6）。ここで定数に倒すと、
 * 歯車で変えた既定が起こし直しても効かない。**effort は対応しないモデル（`haiku` など）でも
 * 渡す**——`query()` 自身が対応の有無で読み分ける前提を崩さない（渡すかどうかをここで
 * モデルごとに出し分けない）。
 */
export function buildQuerySeedOptions(options: SessionDriverOptions): QuerySeedOptions {
  return {
    cwd: options.cwd,
    includePartialMessages: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: options.model,
    effort: options.effort,
    resume: options.start.kind === "resume" ? options.start.sessionId : undefined,
    settings: { language: "japanese" },
    env: childProcessEnv(options.inheritedEnv),
  }
}

/**
 * 雑談の要約の写しへ書き込む `PostCompact` フック（`docs/design.md` 7章）。**雑談のとき
 * （`options.mode` が `chat`）だけ登録する**——仕事のときは `hooks`
 * そのものを渡さない（undefined。`query()` 側は省略と同じ扱い）。
 *
 * `compact_summary` は**ログに出さず**、中身を読まずに {@link ChatSummary.write} へそのまま
 * 渡す（`docs/coding-standards.md`「会話内容の扱い」）。フックは `trigger` が `"manual"` でも
 * `"auto"` でも同じ扱いにする（`docs/design.md` 7章）。
 *
 * 写したあとは、**書いた写しから取り出した最近の話題の見出しだけ**を `chat-topics-changed` で
 * 流す（`docs/screen-design.md` 13.7）。取り出し方は core（`readChatTopics`）が持ち、ここは中身を
 * 見ない。
 *
 * `startSdkDriver` から切り出してあるのは、本物の `query()` を呼ばずにフックの中身を検査できる
 * ようにするため（{@link buildQuerySeedOptions} と同じ理由）。
 */
export function chatSummaryHooks(
  mode: SessionMode,
  onEvent: (event: SessionEvent) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  if (mode.kind !== "chat") {
    return undefined
  }

  const { chatSummary } = mode
  return {
    PostCompact: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "PostCompact") {
              chatSummary.write(input.compact_summary)
              onEvent({ kind: "chat-topics-changed", topics: readChatTopics(chatSummary) })
            }
            return {}
          },
        ],
      },
    ],
  }
}

/**
 * `Stop` フックを1つ登録する。**モードによらず常に登録する**（`chatSummaryHooks` と違い
 * `undefined` を返さない）——effort を読む口（{@link EffortLevel}。`docs/screen-design.md` 13.9
 * 「動き方の操作子」）は仕事でも雑談でも要るが、`report` の関所
 * （`src/server/report/core/report-tool.ts` の {@link createReportGate}）で止めるのは仕事のときだけ。
 * `SubagentStop` には載せない（サブエージェントの `report` は捨てるので、渡し直させても画面に
 * 出ない。effort もメインの手元の値だけを読めばよい）。
 *
 * **effort はブロック判定より先に読む。** `input.effort?.level` が
 * {@link isEffortLevel} を通れば `effort-changed` を流す——**帯に表示する値の源はここだけ**
 * （実測は `docs/history/decision.md`「effort の途中変更と読み取りが成り立った実測」）。
 *
 * **関所の判定の前に1回だけ macrotask を待つ。** SDK はフックの呼び出し（制御リクエスト）を
 * 読んだその場で処理し、それより前に届いたメッセージは列に積んで {@link relayMessages} の反復へ
 * 渡すので、待たないと止まる直前の本文が関所に届く前に判定しうる。列を空けるのは microtask
 * だけなので、macrotask を1回待てば足りる（**雑談のときはこの待ちも関所の判定も行わない**）。
 *
 * `startSdkDriver` から切り出してあるのは、本物の `query()` を呼ばずにフックの中身を検査できる
 * ようにするため（{@link chatSummaryHooks} と同じ理由）。
 */
export function stopHooks(
  mode: SessionMode,
  gate: ReportGate,
  onEvent: (event: SessionEvent) => void,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    Stop: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "Stop") {
              return {}
            }
            const level = input.effort?.level
            if (level !== undefined && isEffortLevel(level)) {
              onEvent({ kind: "effort-changed", effort: level })
            }
            if (mode.kind !== "work") {
              return {}
            }
            await setImmediate()
            const verdict = gate.verdict(input.stop_hook_active)
            return verdict.kind === "block" ? { decision: "block", reason: verdict.reason } : {}
          },
        ],
      },
    ],
  }
}

/**
 * 届いたメッセージを内部イベントに変えて流し続ける。**反復を包む `try`/`catch` はここだけ**で、
 * 反復が終わる・落ちるのどちらもセッションの終わりとして扱う。
 *
 * `report` の関所（`reportGate`）には**メインのメッセージから出たイベントだけ**を見せる
 * （サブエージェントの本文を数えない。関所を登録していないときも見せるが、判定されないだけ）。
 *
 * メインのイベントは先に `report` の差し戻し（`reportReview`）を通す——`report` を同じ呼び出しの
 * 結果まで預かり、差し戻した呼び出しを描かない（`src/server/report/core/report-review.ts`）。`report`
 * ツールが載っていなければ `report` イベントは来ないので、切り替えないときはそのまま流れる。
 *
 * `titleIntake` が覚えている題（`report` の `title` 引数。`src/server/adapter/sdk-tool.ts`）も
 * ターンの終わりに取り出し、`titleWriter` に書く予約をする。
 *
 * `diaryStageTracker`（`src/server/core/diary-tool.ts`）には**メインのメッセージを生のまま**
 * 渡す——3段目の合図（`bookmark` の鍵）は変換前の `input_json_delta` にしか無い
 * （`docs/design.md`「日記の受け取りと保存」「3段の進みの決まり方」）。`diaryIntake` は
 * ターンが終わるたびに「いま書く日」を忘れる（{@link DiaryIntake.forgetDay}）。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
  reportGate: ReportGate,
  reportReview: ReportReview,
  titleIntake: SessionTitleIntake,
  titleWriter: SessionTitleWriter,
  diaryStageTracker: DiaryStageTracker,
  diaryIntake: DiaryIntake,
): Promise<void> {
  // セッションIDは `session-info`（ターンのたびに届く）から取り、ターンが終わるたびに
  // 印を付け直す（{@link scheduleMarkSession}）。
  let sessionId: string | undefined = undefined
  try {
    for await (const message of session) {
      const fromMain = !isSubagentMessage(message)
      // 環境変数が効かなくなったことに気づくための1行。届いた事実だけで、中身は写さない。
      if (fromMain && isVisibleOutputNudge(message)) {
        process.stderr.write(VISIBLE_OUTPUT_NUDGE_NOTICE)
      }
      if (fromMain) {
        const stage = diaryStageTracker.observe(message)
        if (stage !== undefined) {
          options.onEvent({ kind: "diary-stage", stage })
        }
      }
      const converted = toSessionEvents(message, toExpressionNames(options.expressions))
      const events = fromMain ? converted.flatMap((event) => reportReview.pass(event)) : converted
      for (const event of events) {
        if (fromMain) {
          reportGate.observe(event)
        }
        if (event.kind === "session-info") {
          sessionId = event.sessionId
        }
        if (event.kind === "turn-finished") {
          // **1ターンに書けるのは1行**（docs/design.md 7.1）。ターンの区切りを知っているのは
          // ここだけなので、終わるたびに次の1行を受け付けさせる。
          if (options.mode.kind === "chat") {
            options.mode.personaMemory.finishTurn()
          }
          // 成果の振り返りの窓口も、ターンが終わるたびに「いま書く日」を忘れる
          // （`docs/design.md`「日記の受け取りと保存」）。
          diaryIntake.forgetDay()
          if (sessionId !== undefined) {
            scheduleMarkSession(sessionId, options)
            const title = titleIntake.take()
            if (title !== undefined) {
              titleWriter.schedule(sessionId, title, options)
            }
          }
        }
        if (event.kind === "conversation-cleared") {
          // `/clear` を見た合図。写しの印を「未渡し」に戻す——印はターンが終わるたびに
          // そのときのセッションIDへ付け直されるので、`/clear` のあと1ターン回すと空のほうが
          // 印を持つ（`docs/chat-mode.md` 4.9「印はターンが終わるたびに…」）。ここで戻さないと
          // 次に起こしたとき記憶が二度と戻らない。
          if (options.mode.kind === "chat") {
            options.mode.chatSummary.markUndelivered()
          }
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
 * グローバルの出力スタイル（`~/.claude/settings.json` の `outputStyle`）をこのセッションの中だけ
 * 中立に戻す。**そうしないと人格が二重に効く**（パックの `persona.md` と、全プロジェクトに効く
 * 出力スタイルが重なる。実測: 応答が両方の人格を名乗った。docs/requirements.md 4.4）。
 *
 * 触るのは**セッション限りのフラグ層だけ**で、設定ファイルは書き換えない（`updateSettings` の
 * ほうはファイルを書くので使わない）。**失敗しても続行する** — 人格が二重になるだけで、
 * セッション自体は動く（docs/coding-standards.md「エラーハンドリング」）。
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
 * コマンドの説明を1回だけ取りに行く。`init` の `slash_commands` は名前だけなので、説明は
 * この制御リクエストから受け取る（組み込みコマンドの分も返る）。
 * 以降セッション中に増減したときは `commands_changed` が押してくる（src/server/core/sdk-message.ts）。
 *
 * **取れなくてもセッションは続ける**（説明が無いまま名前だけの補完に戻るだけ。
 * docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」）。
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
 * プラン（`docs/glossary.md`「プラン」）を1回だけ取りに行く。`accountInfo()` は `email` /
 * `organization` も返すが、**駆動の外へ出すのは `toPlan` が取り出した `subscriptionType` だけ**
 * （`toPlan` の戻り値しか触らないので、他のフィールドに触れる経路が無い）。
 *
 * **名前は Claude Code の控えを先に見て決める**（`src/server/core/plan.ts`。SDK の
 * `subscriptionType` は契約の段と合わないことがあり、控えのほうが段と枠を別々に持つ）。
 * 控えから決まらなければ SDK の値をそのまま出す。
 *
 * **取れなくてもセッションは続ける**（API キーや Bedrock のときは元々この値が無い。
 * docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」。
 * {@link relayCommandDescriptions} と同じ形）。
 */
async function relayPlan(
  session: { readonly accountInfo: () => Promise<unknown> },
  options: SessionDriverOptions,
  readTier: () => ClaudeAccountTier = readClaudeAccountTier,
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
 * モデルごとの effort の対応（`ModelEffortSupport`。`src/shared/session-event.ts`）を1回だけ
 * 取りに行く（`supportedModels()`。`relayCommandDescriptions` / `relayPlan` と同じ契機）。帯の
 * effort の
 * ドロップダウンが、いまのモデルで選べる段を絞るのに使う（`docs/screen-design.md` 13.9
 * 「動き方の操作子」）。
 *
 * **取れなくても・空でもセッションは続ける**（画面は effort を「対応するかどうか分からない」
 * のまま扱うだけ。docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」。
 * {@link relayCommandDescriptions} と同じ形）。
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
 * 許可要求と質問を答え待ちの列へ回す。**`canUseTool` の戻り値の型（`PermissionResult`）に
 * 合わせるのはここだけ**で、列の側は SDK を知らない（構造は一致している）。
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
 * 送る依頼1件。**駆動が持つ原寸の画像はここまでで、`stream()` が渡したあとは持たない**
 * （拡大表示のために残すのは棚 = `src/server/core/prompt-image-shelf.ts` の側）。
 */
type Prompt = {
  readonly text: string
  readonly images: readonly PromptContentBlock[]
}

/**
 * user メッセージの内容ブロック1つ。**`MessageParam` の型をそのまま使う**（自前の型を作らない。
 * `docs/requirements.md` 4.10 の裏取り）。
 */
type PromptContentBlock = Extract<SDKUserMessage["message"]["content"], readonly unknown[]>[number]

/**
 * ストリーミング入力。`query` には「まだ終わらない」非同期イテレータを渡し、依頼が届くたびに
 * user メッセージを1つ流す（docs/requirements.md 4.1「同じ `query` への追加入力」）。
 *
 * **画像を添えられるのはストリーミング入力だけ**（単発入力は受け付けない。
 * `docs/requirements.md` 4.10）。添えたときは `content` を配列にし、画像のブロックを先に、
 * 文面を後ろに置く。
 */
function createPromptStream(): {
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
      }
    },
  }
}

/** 依頼1件の `content`。画像が無ければ文字列のまま（いままでと同じ形）。 */
function promptContent(prompt: Prompt): SDKUserMessage["message"]["content"] {
  return prompt.images.length === 0
    ? prompt.text
    : [...prompt.images, { type: "text", text: prompt.text }]
}

/**
 * 依頼に添えられた画像1枚を、モデルへ渡す内容ブロックにする。**渡せない形・大きすぎるものは
 * 空**（その1枚を諦めて依頼そのものは送る。docs/coding-standards.md「エラーハンドリング」）。
 *
 * 形は境界（`src/shared/command.ts` の zod）で見てあるので、ここは同じ関数でほどくだけ
 * （立ち絵を書き込む側が `parsePortraitImage` でほどくのと同じ扱い）。
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
