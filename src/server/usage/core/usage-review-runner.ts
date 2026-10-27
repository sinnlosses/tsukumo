// 見直しの走り。トークン消費の画面から頼まれた見直しと提案の実行を、会話とは別の使い捨ての問い合わせで1度に1つだけ走らせる。
// 始まりと終わりのイベントはここが流し、段・セリフ・結果は問い合わせのツールの handler が流す。
//
// 走らせる口は決して reject させない（起こせない・中断・時間切れはどれも終わりのイベント1つに落ちる）。
// 依頼文・セリフ・結果の本文はログにもファイルにも書かない。ホームに書くのは受け付けた見直しの結果だけ。

import type { ExpressionChoice } from "../../../shared/character-pack/expression-choice.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  USAGE_REVIEW_REQUEST_TEXT,
  type UsageProposal,
  type UsageProposalFollowUp,
  type UsageProposalRunOutcome,
  type UsageReviewFindings,
  usageProposalKey,
  usageProposalRequestText,
} from "../../../shared/usage/usage-review.ts"
import { createUsageReviewIntake, type UsageReviewIntake } from "./usage-review-tool.ts"

/** 見直しは 10 分で諦める（仮）。 */
const USAGE_REVIEW_TIMEOUT_MS = 600_000

/** 提案の実行は 5 分で諦める（仮）。 */
const USAGE_PROPOSAL_TIMEOUT_MS = 300_000

/** 見直しの役目の短い指示（人格のあとに続ける）。 */
const USAGE_REVIEW_INSTRUCTION =
  "あなたはいま、トークン消費の減らし方を見直す役目だけを持つ。" +
  "スキル tsukumo:token-usage-diet の手順で見直し、段に入るたびに usage_review_stage を、見直し案をまとめ終えたら usage_review_result を呼ぶ。" +
  "進みは speak で一言ずつ利用者に伝える。report ツールは無いので呼ばない。"

/** 提案の実行の役目の短い指示（人格のあとに続ける）。 */
const USAGE_PROPOSAL_INSTRUCTION =
  "あなたはいま、トークン消費の見直しで出た提案を1件だけやる役目を持つ。" +
  "依頼された提案のほかには手を付けない。終わったら、何をしたかを speak で一言伝える。"

/** 走らせる時点のパックと環境。始めるたびに読み直す（キャラクターを切り替えたあとは、切り替えたあとのパックで走る）。 */
export type UsageReviewPackContext = {
  /** 人格（`persona.md` の全文）。無ければ空文字列。 */
  readonly persona: string
  readonly expressions: readonly ExpressionChoice[]
  /** claude の作業先（会話と同じ）。 */
  readonly cwd: string
  /** 子プロセスへ引き継ぐ環境変数（会話と同じ）。 */
  readonly env: Readonly<Record<string, string | undefined>>
}

/** 走らせる時点のパックと環境に、始める口が渡したモデルを添えたもの。 */
export type UsageReviewRunnerContext = UsageReviewPackContext & {
  /** 会話のいまのモデル（分からなければ呼び出し側が既定へ畳んで渡す）。 */
  readonly model: string
}

/** 使い捨ての問い合わせ1回に渡すもの。`systemPromptAppend` は Claude Code の既定の指示文のあとに足す。 */
export type UsageReviewQueryRequest = {
  readonly systemPromptAppend: string
  readonly prompt: string
} & UsageReviewRunnerContext

/** 提案の実行の問い合わせに渡すもの。押す口で許す道具が変わる。 */
export type UsageProposalQueryRequest = UsageReviewQueryRequest & {
  readonly followUp: UsageProposalFollowUp
}

/** 疑似セッションで流し直す1手。`afterMs` はその走りの始まりからの経過。 */
export type UsageReviewReplayStep = {
  readonly afterMs: number
  readonly event: SessionEvent
}

/**
 * 走らせる口の出どころ。
 *
 * - `query`: 使い捨ての問い合わせを起こす。どちらの口も、走りきったら resolve し、起こせない・失敗・中断なら reject する
 * - `replay`: 問い合わせを起こさず、渡された手順をそのまま流す（疑似セッション。前回の結果はホームに書かない）。
 *   提案の実行は手順を流したあと「済んだ」で終わる
 */
export type UsageReviewSource =
  | {
      readonly kind: "query"
      readonly review: (
        request: UsageReviewQueryRequest,
        intake: UsageReviewIntake,
        onEvent: (event: SessionEvent) => void,
        signal: AbortSignal,
      ) => Promise<void>
      readonly proposal: (
        request: UsageProposalQueryRequest,
        onEvent: (event: SessionEvent) => void,
        signal: AbortSignal,
      ) => Promise<void>
    }
  | {
      readonly kind: "replay"
      readonly review: readonly UsageReviewReplayStep[]
      readonly proposal: readonly UsageReviewReplayStep[]
    }

/** {@link createUsageReviewRunner} に外の世界から渡すもの（配線が渡す）。 */
export type UsageReviewRunnerPorts = {
  readonly source: UsageReviewSource
  /** 走らせる時点のパックと環境。まだ1回もパックが決まっていなければ undefined（始めずに断る）。 */
  readonly readContext: () => UsageReviewPackContext | undefined
  /** 利用者が見送った提案の識別子。見直しのツールが呼ばれるたびに読み直す。 */
  readonly dismissedKeys: () => readonly string[]
  /** 起動先のプロジェクトにタスク運用があるか。見直しのツールが呼ばれるたびに読み直す。 */
  readonly hasTaskOperation: () => Promise<boolean>
  /** 受け付けた見直しの結果を、次の起動でも「前回の提案」として出せるようにホームへ書く。 */
  readonly writePreviousUsageReview: (reviewedAt: number, findings: UsageReviewFindings) => void
  readonly now: () => number
}

/** 見直しの走り。始める口は、始めたら true、断ったら false を返す（走りは裏で続く）。 */
export type UsageReviewRunner = {
  /** 見直しを `model` で始める。ほかが走っている・閉じた・パックが決まっていないときは断る。 */
  readonly startReview: (model: string, onEvent: (event: SessionEvent) => void) => boolean
  /** 提案1件を `model` で実行する。断る条件は {@link startReview} と同じ。 */
  readonly runProposal: (
    proposal: UsageProposal,
    model: string,
    onEvent: (event: SessionEvent) => void,
  ) => boolean
  /** 走っているものを止める。何も走っていなければ何もしない。 */
  readonly interrupt: () => void
  /** 走っているものを止め、以後は何も始めない。 */
  readonly close: () => void
}

/** {@link UsageReviewRunner} を1つ作る。 */
export function createUsageReviewRunner(ports: UsageReviewRunnerPorts): UsageReviewRunner {
  let running: AbortController | undefined = undefined
  let closed = false

  /** 走りを1つ始める。`run` は中断の印を受け取り、終わりのイベントまで流して resolve する（決して reject しない）。 */
  const begin = (run: (signal: AbortSignal) => Promise<void>): boolean => {
    if (closed || running !== undefined) {
      return false
    }
    const controller = new AbortController()
    running = controller
    void run(controller.signal).finally(() => {
      if (running === controller) {
        running = undefined
      }
    })
    return true
  }

  return {
    startReview: (model, onEvent) => {
      const pack = ports.readContext()
      if (pack === undefined) {
        return false
      }
      return begin(async (interruptSignal) => {
        onEvent({ kind: "usage-review-started" })
        await runReview(ports, { ...pack, model }, onEvent, interruptSignal)
        onEvent({ kind: "usage-review-ended" })
      })
    },
    runProposal: (proposal, model, onEvent) => {
      const pack = ports.readContext()
      if (pack === undefined) {
        return false
      }
      const key = usageProposalKey(proposal)
      return begin(async (interruptSignal) => {
        onEvent({ kind: "usage-proposal-run-started", key })
        const outcome = await runProposal(
          ports,
          { ...pack, model },
          proposal,
          onEvent,
          interruptSignal,
        )
        onEvent({ kind: "usage-proposal-run-ended", key, outcome })
      })
    },
    interrupt: () => {
      running?.abort()
    },
    close: () => {
      closed = true
      running?.abort()
    },
  }
}

/** 見直しを1回走らせる。終わり方は区別しない（結果が届いたかは状態が見る）。 */
async function runReview(
  ports: UsageReviewRunnerPorts,
  context: UsageReviewRunnerContext,
  onEvent: (event: SessionEvent) => void,
  interruptSignal: AbortSignal,
): Promise<void> {
  const signal = AbortSignal.any([interruptSignal, AbortSignal.timeout(USAGE_REVIEW_TIMEOUT_MS)])
  if (ports.source.kind === "replay") {
    await replay(ports.source.review, onEvent, signal)
    return
  }
  const intake = createUsageReviewIntake(ports.dismissedKeys, ports.hasTaskOperation, (event) => {
    if (event.kind === "usage-review-result") {
      ports.writePreviousUsageReview(ports.now(), event.findings)
    }
    onEvent(event)
  })
  try {
    await ports.source.review(
      {
        ...context,
        systemPromptAppend: systemPromptAppend(context.persona, USAGE_REVIEW_INSTRUCTION),
        prompt: USAGE_REVIEW_REQUEST_TEXT,
      },
      intake,
      onEvent,
      signal,
    )
  } catch {
    // 起こせない・中断・時間切れ・API の失敗。どれも「結果を渡さずに終わった」に落ちるだけなので分けない。
  }
}

/** 提案の実行を1回走らせ、終わり方を返す。止めたのは利用者の中断だけで、時間切れは失敗に数える。 */
async function runProposal(
  ports: UsageReviewRunnerPorts,
  context: UsageReviewRunnerContext,
  proposal: UsageProposal,
  onEvent: (event: SessionEvent) => void,
  interruptSignal: AbortSignal,
): Promise<UsageProposalRunOutcome> {
  const signal = AbortSignal.any([interruptSignal, AbortSignal.timeout(USAGE_PROPOSAL_TIMEOUT_MS)])
  try {
    if (ports.source.kind === "replay") {
      await replay(ports.source.proposal, onEvent, signal)
    } else {
      await ports.source.proposal(
        {
          ...context,
          systemPromptAppend: systemPromptAppend(context.persona, USAGE_PROPOSAL_INSTRUCTION),
          prompt: usageProposalRequestText(proposal),
          followUp: proposal.followUp,
        },
        onEvent,
        signal,
      )
    }
    return signal.aborted ? abortedOutcome(interruptSignal) : "succeeded"
  } catch {
    return abortedOutcome(interruptSignal)
  }
}

function abortedOutcome(interruptSignal: AbortSignal): UsageProposalRunOutcome {
  return interruptSignal.aborted ? "interrupted" : "failed"
}

/** 手順を始まりからの経過どおりに流す（前の手との差だけ待つ）。止められたらそこで打ち切る。 */
async function replay(
  steps: readonly UsageReviewReplayStep[],
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let elapsedMs = 0
  for (const step of steps) {
    await wait(step.afterMs - elapsedMs, signal)
    elapsedMs = Math.max(elapsedMs, step.afterMs)
    if (signal.aborted) {
      return
    }
    onEvent(step.event)
  }
}

/** `ms` だけ待つ（負なら待たない）。止められたらすぐ戻る。 */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      },
      Math.max(0, ms),
    )
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/** 人格のあとに役目の指示を続ける。人格が空のパックは、役目の指示だけで起こす。 */
function systemPromptAppend(persona: string, instruction: string): string {
  return [persona, instruction].filter((part) => part.trim() !== "").join("\n\n")
}
