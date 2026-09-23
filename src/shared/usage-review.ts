// 見直し（docs/glossary.md「見直し」）の状態と、その結果の1件である提案。**サーバ（core が
// ツールの引数を検査して状態を畳む）とブラウザ（トークン消費の画面が区画を描く）の両方が同じ
// 型を見る**ので shared に置く。ツールと状態の決定は docs/design.md「見直しのツールと状態」。
//
// **入るのはスキルがツールに渡した結果だけ**で、依頼の文面も本文も入らない
// （docs/coding-standards.md「会話内容の扱い」）。

/**
 * 見直しの段（docs/glossary.md「見直しの段」）。**この並びが段の順**で、いまの段より前は済、
 * 後は未着手と読む。
 */
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
 * 提案の種類。**提案の識別子の半分**（{@link usageProposalKey}）なので、言い回しで揺れない
 * 固定の列挙にする。列挙に無い種類はツールの境界で断る（黙って別の種類に寄せない）。
 * スキル `token-usage-diet` が検討する候補（SKILL.md「4. 何を候補にするか」）に揃えてある。
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

/** 提案（docs/glossary.md「提案」）。`target` の「無い」は空の文字列。 */
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

/**
 * 見直しの状態。
 *
 * - `idle`: ふだん。一度も見直していない・見直しが結果を渡さずに終わった
 * - `running`: 見直し中。`startedAt` はそのターンが始まった時刻（ボタンを押してからの経過を
 *   出すため。最初の段が届くまでの間も数える）、`stage` はいまの段
 * - `result`: 結果が届いた。`reviewedAt` は届いた時刻。**次の見直しが始まるまで持ち続ける**
 */
export type UsageReview =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running"
      readonly startedAt: number
      readonly days: number
      readonly stage: UsageReviewStage
    }
  | { readonly kind: "result"; readonly reviewedAt: number; readonly findings: UsageReviewFindings }

/**
 * 提案の識別子。**種類と対象の組**で、見出しや根拠の言い回しが変わっても同じ提案を指す
 * （見送った提案を次の見直しで出さないための照合に使う）。
 */
export function usageProposalKey(proposal: Pick<UsageProposal, "kind" | "target">): string {
  return `${proposal.kind}:${proposal.target.trim()}`
}

/**
 * 押す口を押したときに会話へ送る依頼文。**提案に依頼文を持たせない**のは、スキルが書く欄を
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
