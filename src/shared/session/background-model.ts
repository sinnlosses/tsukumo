// 裏方のモデル。会話とは別に tsukumo が裏で起こす使い捨ての問い合わせ4つが、それぞれ使うモデル。
// 「新しいセッションの既定」（`SessionDefault`）には混ぜない。あちらは会話を起こすときの4つで1組という型の約束がある。
// 日記と使い方の見直しは呼び出し側が会話のいまのモデルを渡すので、ここには入れない。

import type { ModelAlias } from "./run-setting-value.ts"

/** 裏方の問い合わせの役。 */
const BACKGROUND_MODEL_ROLES = [
  "recommendation",
  "welcomeGreeting",
  "chatConsolidation",
  "characterGeneration",
] as const

export type BackgroundModelRole = (typeof BACKGROUND_MODEL_ROLES)[number]

/** 役ごとに選んだモデル。役ごとに別々に選ぶので、1つだけ違う値でもよい。 */
export type BackgroundModels = Readonly<Record<BackgroundModelRole, ModelAlias>>

/** 同梱の既定。覚えた値が無い・読めない・知らない値の役だけ、ここへ畳む。 */
export const BUILTIN_BACKGROUND_MODELS = {
  recommendation: "haiku",
  welcomeGreeting: "sonnet",
  chatConsolidation: "haiku",
  characterGeneration: "opus",
} satisfies BackgroundModels
