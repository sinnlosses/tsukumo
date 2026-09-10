// キャラクターからの質問（Claude Code の AskUserQuestion）を、画面に出せる形へ読み取る。
// 「読む」層で、ファイルI/Oを持たない（transcript の行を渡すのは src/transcript.ts）。
//
// **利用者が答えるのは Claude Code 本体の TUI**（tsukumo から本体へ戻る経路は無い。
// `docs/architecture.md`）。ただし送信フォームと同じ道（ホストの `sendText`）を使えば、
// 選んだ答えを文字として送ることはできる。ここはその判断を持たず、**何を聞かれているか**
// だけを構造にして返す。
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

/**
 * 回答（`tool_result` の本文）から、選ばれた答えの並びを取り出す。本文は
 * `Your questions have been answered: "質問"="答え", "質問"="答え"` の形の文字列
 * （2026-09-10 実測）。**選択肢のラベルと突き合わせるための材料**として使う。
 *
 * 利用者が「詳しく聞きたい」で質問を差し戻したときは、この形ではない文言が入る。
 * その場合は空を返し、呼び出し側は「答えは分からない」として扱う。
 */
export function parseAnsweredLabels(resultText: string): readonly string[] {
  return [...resultText.matchAll(/"[^"]*"="([^"]*)"/g)].flatMap((matched) =>
    matched[1] === undefined ? [] : [matched[1]],
  )
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
