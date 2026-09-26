// キャラクターからの質問（Claude Code の AskUserQuestion）を、画面に出せる形へ読み取る。
// 「読む」層で、ファイルI/Oを持たない（入力を渡すのは src/domain/pending-answer.ts）。
//
// 答えは画面のボタンから `canUseTool` の戻り値として SDK へ返る（src/domain/pending-answer.ts）。
// ここはその判断を持たず、何を聞かれているかだけを構造にして返す。
//
// 質問文と選択肢は会話の内容そのものなので、ログや状態ファイルには書かない
// （`docs/coding-standards.md`「会話内容の扱い」）。画面に出す経路だけで扱う。

import { isPlainObject } from "remeda"

/**
 * 1つの選択肢。`preview` はその選択肢を選ぶと何が起きるかを比べるための本文（Markdown。
 * 表・mermaid・レポートの記法がそのまま書ける）で、メインビューの質問の札
 * （`src/browser/components/page/conversation/components/main-view/components/question-ask/question-ask.tsx`）が選択肢の説明の下に描く。
 *
 * 以前はここで捨てていた（「数十行になるので持ち回らない」）。選択肢が
 * 文章だけになって比べられないという指摘で、読んで運ぶように変えた。数十行になるのは
 * 変わらないが、運ぶ先は画面だけ（ログにも状態ファイルにも書かない。ファイル冒頭の注記）。
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
 * 質問1件に対して利用者が選んだ答え。選択肢のラベルと、自由入力に打った文字列が同じ並びに
 * 混ざる（自由入力は `options` のどれとも一致しないので、突き合わせる側はそれで見分ける。
 * `src/browser/components/page/conversation/components/main-view/components/question-record/question-record.tsx`）。複数選択のときは選んだぶんだけ要素が並ぶ。
 *
 * SDK へ返すときは1つの文字列に畳む（質問1件に対して1つの文字列という `AskUserQuestion` の
 * 形。畳むのは `src/server/session-driver/core/pending-answer.ts` の役目で、画面側はこの形のまま送る）。
 */
export type QuestionAnswer = readonly string[]

/**
 * `AskUserQuestion` の自由入力の選択肢のラベル。このラベルの選択肢は札に出さず、自由入力は
 * 入力欄が担う（`src/browser/stores/question-answer.tsx`）。{@link sortQuestionOptions} が
 * 並べ替えで末尾に固定する対象でもあるので、両側から同じ定数を読めるようここに置く。
 */
export const FREE_TEXT_OPTION_LABEL = "その他"

/**
 * 選択肢をラベルの辞書順に並べ替える。モデルが送ってきた順のままでは崩れて出ることがある
 * という指摘に対する並べ替えで、並べ替えるのはブラウザ側（`docs/requirements.md`
 * 4.2。サーバは SDK の並びをそのまま渡す。`/` コマンド補完の `command-suggestions.tsx` の
 * `byName` と同じ立場）。
 *
 * - ラベルは日本語が普通なので `localeCompare` で比べる（`src/server/character-pack/adapter/character-pack.ts`
 *   の `listPackDirs` と同じ比べ方）。ロケールは `"ja"` に固定する — 省くと実行環境の既定
 *   ロケールに解決され、ブラウザ（`ja`）と Bun のテスト（`en-US`）で漢字の並びが食い違う
 *   （目視確認で判明。テストが通る並びと画面に出る並びが別物になる）
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
