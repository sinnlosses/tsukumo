// 答え待ち（許可要求とキャラクターからの質問）の語彙と、画面から返ってくる答えの形。
// **サーバとブラウザの両方が読む契約**なので shared に置く（docs/design.md 2章）。
//
// **列そのもの（Promise を保留する仕掛け）は core（src/server/core/pending-answer.ts）にある**
// （SDK の `canUseTool` に結び付くため）。ここは型と、外から届いた答えの検証だけ。
//
// 許可要求の入力と質問文は会話の内容そのものなので、ログにもファイルにも書かない
// （docs/coding-standards.md「会話内容の扱い」）。

import { z } from "zod"

import { type Question, type QuestionAnswer } from "./question.ts"

/** 答え待ち1件。`id` は SDK の `toolUseID`（1つのツール呼び出しに1つ）。 */
export type PendingAsk =
  | {
      readonly kind: "permission"
      readonly id: string
      readonly toolName: string
      readonly input: Readonly<Record<string, unknown>>
    }
  | { readonly kind: "question"; readonly id: string; readonly questions: readonly Question[] }

/** 画面から返ってくる答え。 */
export type Answer =
  /** 許可する（許可要求にだけ意味がある）。 */
  | { readonly kind: "allow" }
  /** 拒否する（許可要求・質問のどちらにも使える）。 */
  | { readonly kind: "deny" }
  /**
   * 質問に答える。**`labels[i]` が `questions[i]` に対して選んだ答えの並び**
   * （{@link QuestionAnswer}。複数選択は選んだぶんだけ、自由入力はその文字列が入る）。
   *
   * **1つの文字列に畳まない**（2026-09-16 変更。以前は画面側が「、」でつないだ1つの文字列を
   * 入れていたが、それだと記録（`question-answered`）の側で選択肢と突き合わせられなくなる。
   * SDK へ渡す形へ畳むのは src/server/core/pending-answer.ts の役目）。
   */
  | { readonly kind: "answers"; readonly labels: readonly QuestionAnswer[] }

/**
 * 画面から届いた答えのスキーマ。**書き込みの経路なので zod で厳密に見る**
 * （docs/design.md 4.3。`labels` は自由入力の文字列も受け取れる — 選択肢との一致は要求しない）。
 * コマンド（src/shared/command.ts）の `answer` もこれを使う。
 */
export const answerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allow") }),
  z.object({ kind: z.literal("deny") }),
  z.object({ kind: z.literal("answers"), labels: z.array(z.array(z.string())) }),
])

/**
 * 画面から届いた JSON（外部由来の `unknown`）を {@link Answer} として検証する。
 * 形が違うときは undefined を返す。
 */
export function parseAnswer(value: unknown): Answer | undefined {
  const parsed = answerSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
