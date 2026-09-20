// キャラクターからの質問（Claude Code の AskUserQuestion）を、画面に出せる形へ読み取る。
// 「読む」層で、ファイルI/Oを持たない（入力を渡すのは src/domain/pending-answer.ts）。
//
// **答えは画面のボタンから `canUseTool` の戻り値として SDK へ返る**（src/domain/pending-answer.ts）。
// ここはその判断を持たず、**何を聞かれているか**だけを構造にして返す。
//
// 質問文と選択肢は会話の内容そのものなので、**ログや状態ファイルには書かない**
// （`docs/coding-standards.md`「会話内容の扱い」）。画面に出す経路だけで扱う。

/** 1つの選択肢。`preview` は数十行になることがあるので、読み取りの時点で捨てる。 */
export type QuestionOption = {
  readonly label: string
  readonly description: string
}

export type Question = {
  readonly header: string
  readonly text: string
  readonly multiSelect: boolean
  readonly options: readonly QuestionOption[]
}

/**
 * 質問1件に対して利用者が選んだ答え。**選択肢のラベルと、自由入力に打った文字列が同じ並びに
 * 混ざる**（自由入力は `options` のどれとも一致しないので、突き合わせる側はそれで見分ける。
 * `src/browser/features/main-view/question-record.tsx`）。複数選択のときは選んだぶんだけ要素が並ぶ。
 *
 * **SDK へ返すときは1つの文字列に畳む**（質問1件に対して1つの文字列という `AskUserQuestion` の
 * 形。畳むのは `src/server/core/pending-answer.ts` の役目で、画面側はこの形のまま送る）。
 */
export type QuestionAnswer = readonly string[]

/**
 * `AskUserQuestion` の入力（外部由来の `unknown`）を検証して質問の並びにする。
 * 形が違う・`questions` が空のときは undefined を返す（画面には何も出さない）。
 *
 * - `question` / `header` が文字列でない要素は**その要素だけ**捨てる
 * - `options` は `label` が文字列のものだけを採る。`description` は無ければ空文字にする
 * - **`preview` は読まない。** 表示に使わないものを持ち回らないため
 */
export function parseQuestions(input: unknown): readonly Question[] | undefined {
  if (!isRecord(input) || !Array.isArray(input.questions)) {
    return undefined
  }

  const questions = input.questions.flatMap((item) => toQuestion(item))
  return questions.length === 0 ? undefined : questions
}

function toQuestion(value: unknown): readonly Question[] {
  if (!isRecord(value) || typeof value.question !== "string" || typeof value.header !== "string") {
    return []
  }

  const options = Array.isArray(value.options) ? value.options.flatMap((o) => toOption(o)) : []

  return [
    {
      header: value.header,
      text: value.question,
      multiSelect: value.multiSelect === true,
      options,
    },
  ]
}

function toOption(value: unknown): readonly QuestionOption[] {
  if (!isRecord(value) || typeof value.label !== "string") {
    return []
  }

  return [
    {
      label: value.label,
      description: typeof value.description === "string" ? value.description : "",
    },
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
