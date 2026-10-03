// おすすめの札1枚の形。
// 中身は会話を含まない（理由の1行はタスク一覧と中身の無い「前回の続き」だけから書かれる）。

/** 迎える口に並べる札の上限。 */
export const MAX_RECOMMENDATION_CARDS = 3

/**
 * おすすめの札1枚。並びの順がおすすめの順。
 * `resume` は前回の続きで、「残り：」の中身は持たない（画面が前のセッションの要約から読む）。
 */
export type RecommendationCard =
  | { readonly kind: "resume"; readonly reason: string }
  | { readonly kind: "task"; readonly taskId: string; readonly reason: string }
