// 見直しの状態と、その結果の1件である提案。
// 入るのはスキルがツールに渡した結果だけで、依頼の文面も本文も入らない。

/** 見直しの段。この並びが段の順で、いまの段より前は済、後は未着手と読む。 */
export const USAGE_REVIEW_STAGES = ["model", "cache", "tool", "context", "proposal"] as const

export type UsageReviewStage = (typeof USAGE_REVIEW_STAGES)[number]

/** 段の見出し。ツールの説明文（モデルが読む）と画面の段の並び（利用者が読む）の両方に使う。 */
export const USAGE_REVIEW_STAGE_LABELS = {
  model: "モデルの使い分けを見る",
  cache: "キャッシュの効き方を見る",
  tool: "ツールの呼び方と結果の大きさを見る",
  context: "コンテキストの中身を見る",
  proposal: "見直し案をまとめる",
} as const satisfies Record<UsageReviewStage, string>

/**
 * 提案の種類。提案の識別子の半分（{@link usageProposalKey}）なので、言い回しで揺れない固定の列挙にする。
 * 列挙に無い種類はツールの境界で断る（黙って別の種類に寄せない）。
 * スキル `token-usage-diet` が検討する候補（SKILL.md「何を候補にするか」）に揃える。
 */
export const USAGE_PROPOSAL_KINDS = [
  "unused-mcp",
  "memory-file",
  "skill-definition",
  "subagent-share",
  "tool-result",
  "cache-reuse",
  "session-length",
  "model-choice",
] as const

export type UsageProposalKind = (typeof USAGE_PROPOSAL_KINDS)[number]

/** 種類ごとに `target` に何を入れるか。ツールの説明文に載せる。 */
export const USAGE_PROPOSAL_KIND_TARGETS = {
  "unused-mcp": "使っていない MCP サーバの名前",
  "memory-file": "メモリファイルのパス",
  "skill-definition": "スキルの名前（定義全体なら空）",
  "subagent-share": "空",
  "tool-result": "ツールの名前",
  "cache-reuse": "空",
  "session-length": "空",
  "model-choice": "移す先のモデル（決めないなら空）",
} as const satisfies Record<UsageProposalKind, string>

/** 効きめ（大 / 中 / 小）。 */
export const USAGE_PROPOSAL_IMPACTS = ["large", "medium", "small"] as const

export type UsageProposalImpact = (typeof USAGE_PROPOSAL_IMPACTS)[number]

/** 押す口。`delegate` は「tsukumo に頼む」、`task` は「タスクにする」。 */
export const USAGE_PROPOSAL_FOLLOW_UPS = ["delegate", "task"] as const

export type UsageProposalFollowUp = (typeof USAGE_PROPOSAL_FOLLOW_UPS)[number]

/** 提案。`target` の「無い」は空の文字列。 */
export type UsageProposal = {
  readonly kind: UsageProposalKind
  readonly target: string
  readonly impact: UsageProposalImpact
  readonly title: string
  readonly basis: string
  readonly action: string
  readonly followUp: UsageProposalFollowUp
}

/** `usage_review_result` ツールが渡す見直しの結果。 */
export type UsageReviewFindings = {
  /** 見た期間（今日を含む直近何日か）。 */
  readonly days: number
  /** 冒頭の一言（キャラクターの口調）。 */
  readonly headline: string
  /** 効きめの大きい順。 */
  readonly proposals: readonly UsageProposal[]
}

/** 走っている見直しか提案の実行の、直近のセリフ（`speak`）。まだ無ければ `none`。 */
export type UsageReviewSpeech =
  | { readonly kind: "none" }
  | { readonly kind: "said"; readonly text: string }

/**
 * 見直し中の進み。
 *
 * - `preparing`: 始まったが、最初の段がまだ届いていない
 * - `stage`: いまの段と、見ている期間（今日を含む直近何日か）
 */
export type UsageReviewProgress =
  | { readonly kind: "preparing" }
  | { readonly kind: "stage"; readonly stage: UsageReviewStage; readonly days: number }

/**
 * 見直しの状態。会話のターンとは関係なく、見直しの走りが流すイベントだけで動く。
 *
 * - `idle`: ふだん。一度も見直していない・見直しが結果を渡さずに終わった
 * - `running`: 見直し中。`startedAt` は見直しが始まった時刻（最初の段が届くまでの間も経過に数える）
 * - `result`: 結果が届いた。`reviewedAt` は届いた時刻。次の見直しが始まるまで持ち続ける
 */
export type UsageReview =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running"
      readonly startedAt: number
      readonly progress: UsageReviewProgress
      readonly speech: UsageReviewSpeech
    }
  | { readonly kind: "result"; readonly reviewedAt: number; readonly findings: UsageReviewFindings }

export type UsageProposalRunOutcome = "succeeded" | "failed" | "interrupted"

/**
 * 提案の実行（「tsukumo に頼む」「タスクにする」）の状態。`key` は実行した提案の識別子（{@link usageProposalKey}）。
 *
 * - `idle`: まだ1度も実行していない
 * - `running`: 実行中。`startedAt` は始まった時刻
 * - `ended`: 終わった。次の実行が始まるまで持ち続ける
 */
export type UsageProposalRun =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running"
      readonly key: string
      readonly startedAt: number
      readonly speech: UsageReviewSpeech
    }
  | {
      readonly kind: "ended"
      readonly key: string
      readonly outcome: UsageProposalRunOutcome
      readonly speech: UsageReviewSpeech
    }

/**
 * 提案の識別子。種類と対象の組で、見出しや根拠の言い回しが変わっても同じ提案を指す
 * （見送った提案を次の見直しで出さないための照合に使う）。
 */
export function usageProposalKey(proposal: Pick<UsageProposal, "kind" | "target">): string {
  return `${proposal.kind}:${proposal.target.trim()}`
}

/**
 * 前回の見直しの結果。{@link UsageReview} の `result` とは別の状態。
 * `usageReview` はプロセスの再起動でふだんへ戻るが、こちらはホームのファイル（`~/.tsukumo/usage-review.json`）に残り続け、プロセスの再起動でも消えない。
 *
 * - `none`: 一度も見直していない（リンクを出さない）
 * - `found`: 直前の1回の結果。古い結果は新しいもので置き換わり、履歴には残らない
 */
export type PreviousUsageReview =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly reviewedAt: number; readonly findings: UsageReviewFindings }

/**
 * ホームから読んだ前回の結果から、見送った提案を除く。見送りは前回の結果のファイルを
 * 書き換えないので、起動し直したときはここで除かないと見送った札が戻ってくる。
 */
export function withoutDismissedProposals(
  previous: PreviousUsageReview,
  dismissedKeys: readonly string[],
): PreviousUsageReview {
  if (previous.kind === "none") {
    return previous
  }
  return {
    ...previous,
    findings: {
      ...previous.findings,
      proposals: previous.findings.proposals.filter(
        (proposal) => !dismissedKeys.includes(usageProposalKey(proposal)),
      ),
    },
  }
}

/** 「減らし方を見てもらう」を押したときに見直しの問い合わせへ渡す依頼文。期間は書かない（スキルの既定に任せる）。 */
export const USAGE_REVIEW_REQUEST_TEXT =
  "トークン消費の減らし方を見てほしい。直近の使い方（モデル・ツール・キャッシュ・コンテキスト）から、効きそうな見直しを挙げて。"

/**
 * 押す口を押したときに提案の実行の問い合わせへ渡す依頼文。提案に依頼文を持たせないのは、スキルが書く欄を
 * 増やさず、押す口ごとの頼み方を1箇所で揃えるため。
 */
export function usageProposalRequestText(proposal: UsageProposal): string {
  return [
    `トークン消費の減らし方の提案「${proposal.title}」を${FOLLOW_UP_REQUESTS[proposal.followUp]}`,
    `やること: ${proposal.action}`,
    `根拠: ${proposal.basis}`,
  ].join("\n")
}

const FOLLOW_UP_REQUESTS = {
  delegate: "やってほしい。",
  task: "あとでやるタスクとして登録してほしい（いまは手を付けない）。",
} as const satisfies Record<UsageProposalFollowUp, string>

/** 見直しの3つの欄（`SessionState.usageReview`・`SessionState.previousUsageReview`・`SessionState.usageProposalRun`）。 */
export type UsageReviewFields = {
  readonly usageReview: UsageReview
  readonly previousUsageReview: PreviousUsageReview
  readonly usageProposalRun: UsageProposalRun
}

/**
 * 見直しの欄を動かすイベント。
 * 出し手は見直しの走り（会話とは別の使い捨ての問い合わせ）とその問い合わせのツールの handler、見送りは画面のコマンドで、会話の駆動からは出ない。
 */
export type UsageReviewEvent =
  /** 見直しが始まった。 */
  | { readonly kind: "usage-review-started" }
  /** 見直しが段に入った（`usage_review_stage` ツールが受け付けた呼び出し）。 */
  | { readonly kind: "usage-review-stage"; readonly stage: UsageReviewStage; readonly days: number }
  /** 見直しの結果が届いた（`usage_review_result` ツールが受け付けた呼び出し）。 */
  | { readonly kind: "usage-review-result"; readonly findings: UsageReviewFindings }
  /** 見直しの問い合わせが終わった（結果を渡したかどうかによらず1回）。 */
  | { readonly kind: "usage-review-ended" }
  /** 走っている見直しか提案の実行が `speak` を呼んだ。 */
  | { readonly kind: "usage-review-speech"; readonly text: string }
  /** 提案の実行が始まった。`key` は `usageProposalKey` と同じ形（`kind:target`）。 */
  | { readonly kind: "usage-proposal-run-started"; readonly key: string }
  /** 提案の実行が終わった。 */
  | {
      readonly kind: "usage-proposal-run-ended"
      readonly key: string
      readonly outcome: UsageProposalRunOutcome
    }
  /** 提案を1件見送った（画面の `usageReview.dismissProposal` コマンド）。`key` は `usageProposalKey` と同じ形（`kind:target`）。 */
  | { readonly kind: "usage-proposal-dismissed"; readonly key: string }

/** 見直しのイベント1件を畳む。`at` はイベントの時刻。 */
export function applyUsageReviewEvent(
  fields: UsageReviewFields,
  event: UsageReviewEvent,
  at: number,
): UsageReviewFields {
  switch (event.kind) {
    case "usage-review-started":
      return {
        ...fields,
        usageReview: {
          kind: "running",
          startedAt: at,
          progress: { kind: "preparing" },
          speech: { kind: "none" },
        },
      }
    case "usage-review-stage":
      return {
        ...fields,
        usageReview: {
          kind: "running",
          startedAt: fields.usageReview.kind === "running" ? fields.usageReview.startedAt : at,
          progress: { kind: "stage", stage: event.stage, days: event.days },
          speech:
            fields.usageReview.kind === "running" ? fields.usageReview.speech : { kind: "none" },
        },
      }
    case "usage-review-result":
      return {
        ...fields,
        usageReview: { kind: "result", reviewedAt: at, findings: event.findings },
        // 両方いっぺんに更新する（結果が届いたその場で「前回の提案」も最新になる）。
        previousUsageReview: { kind: "found", reviewedAt: at, findings: event.findings },
      }
    case "usage-review-ended":
      // 結果を渡さずに終わった見直しだけをふだんへ戻す（結果・ふだんはそのまま）。
      return fields.usageReview.kind === "running"
        ? { ...fields, usageReview: { kind: "idle" } }
        : fields
    case "usage-review-speech":
      return withSpeech(fields, { kind: "said", text: event.text })
    case "usage-proposal-run-started":
      return {
        ...fields,
        usageProposalRun: {
          kind: "running",
          key: event.key,
          startedAt: at,
          speech: { kind: "none" },
        },
      }
    case "usage-proposal-run-ended":
      return fields.usageProposalRun.kind === "running" && fields.usageProposalRun.key === event.key
        ? {
            ...fields,
            usageProposalRun: {
              kind: "ended",
              key: event.key,
              outcome: event.outcome,
              speech: fields.usageProposalRun.speech,
            },
          }
        : fields
    case "usage-proposal-dismissed":
      return {
        ...fields,
        usageReview:
          fields.usageReview.kind === "result"
            ? {
                ...fields.usageReview,
                findings: withoutProposal(fields.usageReview.findings, event.key),
              }
            : fields.usageReview,
        previousUsageReview:
          fields.previousUsageReview.kind === "found"
            ? {
                ...fields.previousUsageReview,
                findings: withoutProposal(fields.previousUsageReview.findings, event.key),
              }
            : fields.previousUsageReview,
      }
  }
}

/** セリフを、走っているほう（見直しか提案の実行。同時には1つだけ走る）に載せる。どちらも走っていなければ捨てる。 */
function withSpeech(fields: UsageReviewFields, speech: UsageReviewSpeech): UsageReviewFields {
  if (fields.usageReview.kind === "running") {
    return { ...fields, usageReview: { ...fields.usageReview, speech } }
  }
  if (fields.usageProposalRun.kind === "running") {
    return { ...fields, usageProposalRun: { ...fields.usageProposalRun, speech } }
  }
  return fields
}

/** 提案の並びから、識別子（{@link usageProposalKey}）が一致する1件を除く。 */
function withoutProposal(findings: UsageReviewFindings, key: string): UsageReviewFindings {
  return {
    ...findings,
    proposals: findings.proposals.filter((proposal) => usageProposalKey(proposal) !== key),
  }
}
