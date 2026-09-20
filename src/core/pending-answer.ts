// 答え待ちの列。SDK の `canUseTool` に届いた許可要求とキャラクターからの質問を積み、
// 画面から答えが来るまで Promise を保留する（docs/requirements.md 4.1 / 4.2）。
//
// **SDK の型を import しない**（依存は src/adapter/sdk-driver.ts の1ファイルに閉じる）。
// `AnswerResult` は SDK の `PermissionResult` と構造が一致するので、駆動側はそのまま返せる。
// 答え待ちの語彙そのもの（`PendingAsk` / `Answer`）は shared にある。
//
// 許可要求の入力と質問文は会話の内容そのものなので、ログにもファイルにも書かない
// （docs/coding-standards.md「会話内容の扱い」）。

import { type Answer, type PendingAsk } from "../shared/pending-ask.ts"
import { parseQuestions, type Question, type QuestionAnswer } from "../shared/question.ts"

/** キャラクターが質問するときのツール名。これだけを質問として扱う。 */
const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion"

/** 拒否したときにモデルへ返す定型文。**入力の中身は含めない。** */
const DENY_MESSAGE = "利用者が実行を許可しなかった"

/**
 * SDK へ返す `answers` は質問1件に対して1つの文字列なので、複数選んだ答えはこれでつなぐ
 * （2026-09-16 に画面側から移した。画面は質問ごとの並びのまま送る。
 * `src/shared/pending-ask.ts` の `Answer`）。
 */
const ANSWER_SEPARATOR = "、"

/** `canUseTool` の戻り値に渡せる形（SDK の `PermissionResult` と同じ構造）。 */
export type AnswerResult =
  | { readonly behavior: "allow"; readonly updatedInput: Record<string, unknown> }
  | { readonly behavior: "deny"; readonly message: string }

/** 積むときに渡すもの。`signal` はターンが中断されたときに立つ（SDK が渡してくる）。 */
export type AskRequest = {
  readonly id: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly signal: AbortSignal | undefined
}

/**
 * 列の外へ知らせるもの。`onChange` は積まれたとき・解決したときの合図（画面の更新）、
 * `onAnswered` は**質問に答えが付いたとき1回だけ**（メインビューに残す質問の記録。
 * `question-answered` を流すのは呼び出し側の駆動）。
 */
export type PendingAnswerHandlers = {
  readonly onChange: (pending: readonly PendingAsk[]) => void
  readonly onAnswered: (questions: readonly Question[], answers: readonly QuestionAnswer[]) => void
}

export type PendingAnswerQueue = {
  /** 1件積んで、答えが来るまで待つ。中断されたときは拒否として解決する。 */
  readonly ask: (request: AskRequest) => Promise<AnswerResult>
  /**
   * 積まれているものに答える。**解決済み・知らない id は無視して `false` を返す**
   * （同じボタンを二度押しても2回目は何も起きない）。答えの種類が合わないときも無視する。
   */
  readonly answer: (id: string, answer: Answer) => boolean
  /** 今の答え待ち。積まれた順（先頭がいちばん古い）。 */
  readonly list: () => readonly PendingAsk[]
}

/**
 * 答え待ちの列を作る。合図の受け口は {@link PendingAnswerHandlers}。
 *
 * 状態（保留中の Promise の解決関数）を持つのはここだけ。駆動側はこの列を通してしか
 * `canUseTool` の応答を決めない。
 */
export function createPendingAnswerQueue(handlers: PendingAnswerHandlers): PendingAnswerQueue {
  const entries = new Map<string, Entry>()

  const list = (): readonly PendingAsk[] => [...entries.values()].map((entry) => entry.ask)

  const settle = (id: string, entry: Entry, result: AnswerResult): void => {
    entries.delete(id)
    entry.resolve(result)
    handlers.onChange(list())
  }

  return {
    ask: (request) =>
      new Promise<AnswerResult>((resolve) => {
        const entry: Entry = { ask: toPendingAsk(request), input: request.input, resolve }
        entries.set(request.id, entry)
        // 中断されたターンの許可要求は答えられないまま残る。放っておくと列の先頭を塞ぐので、
        // 拒否として畳む（SDK は応答が無いとそのツールを止めたまま待ち続ける）。
        request.signal?.addEventListener("abort", () => {
          if (entries.get(request.id) === entry) {
            settle(request.id, entry, { behavior: "deny", message: DENY_MESSAGE })
          }
        })
        handlers.onChange(list())
      }),

    answer: (id, answer) => {
      const entry = entries.get(id)
      if (entry === undefined) {
        return false
      }

      const result = toAnswerResult(entry, answer)
      if (result === undefined) {
        return false
      }

      // 質問の記録は**答えが確定したここ1回だけ**知らせる（未回答のまま終わった質問は残さない。
      // docs/requirements.md 4.2「許可と質問」）。解決より先に知らせるので、答えを受けて動き
      // 出したツールのイベントより前に記録が積まれる。
      if (entry.ask.kind === "question" && answer.kind === "answers") {
        handlers.onAnswered(entry.ask.questions, answer.labels)
      }

      settle(id, entry, result)
      return true
    },

    list,
  }
}

type Entry = {
  readonly ask: PendingAsk
  readonly input: Readonly<Record<string, unknown>>
  readonly resolve: (result: AnswerResult) => void
}

/**
 * 許可要求と質問を見分ける。`AskUserQuestion` でも `questions` の形が読めないときは
 * 許可要求として扱う（選択肢を出せないので、許可／拒否で答えてもらうしかない）。
 */
function toPendingAsk(request: AskRequest): PendingAsk {
  if (request.toolName !== ASK_USER_QUESTION_TOOL_NAME) {
    return {
      kind: "permission",
      id: request.id,
      toolName: request.toolName,
      input: request.input,
    }
  }

  const questions = parseQuestions(request.input)
  return questions === undefined
    ? { kind: "permission", id: request.id, toolName: request.toolName, input: request.input }
    : { kind: "question", id: request.id, questions }
}

/**
 * 答えを `canUseTool` の戻り値の形にする。答えの種類が答え待ちの種類に合わないときは
 * undefined を返し、答え待ちをそのまま残す。
 *
 * 質問の答えは `updatedInput.answers`（質問文 → 選ばれたラベル）に組む（2026-09-11 実測）。
 * **`questions` は受け取ったものをそのまま返す**（こちらで組み直さない）。
 */
function toAnswerResult(entry: Entry, answer: Answer): AnswerResult | undefined {
  if (answer.kind === "deny") {
    return { behavior: "deny", message: DENY_MESSAGE }
  }

  if (answer.kind === "allow") {
    return entry.ask.kind === "permission"
      ? { behavior: "allow", updatedInput: { ...entry.input } }
      : undefined
  }

  if (entry.ask.kind !== "question") {
    return undefined
  }

  return {
    behavior: "allow",
    updatedInput: { ...entry.input, answers: answersRecord(entry.ask.questions, answer.labels) },
  }
}

/**
 * SDK へ返す `answers`（質問文 → 答えの文字列）。**複数選んだ答えは
 * {@link ANSWER_SEPARATOR} でつなぐ**。何も選ばれていない質問は入れない（空の答えを
 * 送らない）。
 */
function answersRecord(
  questions: readonly Question[],
  labels: readonly QuestionAnswer[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    questions.flatMap((question, index) => {
      const answer = labels[index] ?? []
      return answer.length === 0 ? [] : [[question.text, answer.join(ANSWER_SEPARATOR)] as const]
    }),
  )
}
