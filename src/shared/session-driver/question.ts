// キャラクターからの質問（Claude Code の AskUserQuestion）を、画面に出せる形へ読み取る。
// 答えは画面のボタンから `canUseTool` の戻り値として SDK へ返る。ここはその判断を持たず、何を聞かれているかだけを構造にして返す。
// 質問文と選択肢は会話の内容そのものなので、ログや状態ファイルには書かず、画面に出す経路だけで扱う。

import { isPlainObject } from "remeda"

/**
 * 1つの選択肢。
 * `preview` はその選択肢を選ぶと何が起きるかを比べるための本文（Markdown。表・mermaid・レポートの記法がそのまま書ける）で、数十行になりうるが、運ぶ先は画面だけ。
 */
export type QuestionOption = {
  readonly label: string
  readonly description: string
  readonly preview: string | undefined
}

export type Question = {
  readonly header: string
  readonly text: string
  readonly multiSelect: boolean
  readonly options: readonly QuestionOption[]
}

/**
 * 質問1件に対して利用者が選んだ答え。複数選択のときは選んだぶんだけ要素が並ぶ。
 * 選択肢のラベルと、自由入力に打った文字列が同じ並びに混ざる（自由入力は `options` のどれとも一致しないので、突き合わせる側はそれで見分ける）。
 * SDK へ返すときに1つの文字列へ畳むのは駆動の側で、画面側はこの形のまま送る。
 */
export type QuestionAnswer = readonly string[]

/**
 * `AskUserQuestion` の自由入力の選択肢のラベル。
 * このラベルの選択肢は札に出さず、自由入力は入力欄が担う。{@link sortQuestionOptions} が並べ替えで末尾に固定する対象でもある。
 */
export const FREE_TEXT_OPTION_LABEL = "その他"

/**
 * 選択肢をラベルの辞書順に並べ替える。並べ替えるのはブラウザ側で、サーバは SDK の並びをそのまま渡す。
 *
 * - ラベルは日本語が普通なので `localeCompare` で比べる。
 *   ロケールは `"ja"` に固定する（省くと実行環境の既定ロケールに解決され、ブラウザ（`ja`）とテストを走らせる環境で漢字の並びが食い違う）
 * - 自由入力（{@link FREE_TEXT_OPTION_LABEL}）だけは並べ替えに混ぜず、末尾に固定する
 *   （札には出さない選択肢だが、並べ替えの結果が含めてきたかどうかで変わらないようにする）
 */
export function sortQuestionOptions(options: readonly QuestionOption[]): readonly QuestionOption[] {
  const freeText = options.filter((option) => option.label === FREE_TEXT_OPTION_LABEL)
  const rest = options
    .filter((option) => option.label !== FREE_TEXT_OPTION_LABEL)
    .toSorted((a, b) => a.label.localeCompare(b.label, "ja"))
  return [...rest, ...freeText]
}

/**
 * `AskUserQuestion` の入力（外部由来の `unknown`）を検証して質問の並びにする。
 * 形が違う・`questions` が空のときは undefined を返す（画面には何も出さない）。
 *
 * - `question` / `header` が文字列でない要素はその要素だけ捨てる
 * - `options` は `label` が文字列のものだけを採る。`description` は無ければ空文字にする
 * - `preview` は文字列のときだけ採る（空文字は「無い」と同じ扱いにして undefined に畳む）
 */
export function parseQuestions(input: unknown): readonly Question[] | undefined {
  if (!isPlainObject(input) || !Array.isArray(input.questions)) {
    return undefined
  }

  const questions = input.questions.flatMap((item) => toQuestion(item))
  return questions.length === 0 ? undefined : questions
}

function toQuestion(value: unknown): readonly Question[] {
  if (
    !isPlainObject(value) ||
    typeof value.question !== "string" ||
    typeof value.header !== "string"
  ) {
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
  if (!isPlainObject(value) || typeof value.label !== "string") {
    return []
  }

  const preview =
    typeof value.preview === "string" && value.preview.trim() !== "" ? value.preview : undefined

  return [
    {
      label: value.label,
      description: typeof value.description === "string" ? value.description : "",
      preview,
    },
  ]
}
