// `<QuestionAsk>`（答え待ちの質問の箱）のロジック（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。質問ごとの選択と自由入力を持ち、進む・戻る・送るを決め、選択肢を
// 部品がそのまま置ける行（{@link QuestionOptionRow}）へ畳んで返す。
//
// **質問は1問ずつ出す**（入力欄の領域が縦に溢れないようにするため）。単一選択は選んだ瞬間に
// 次の質問へ進み、最後の1問を答えた時点で**全問ぶんをまとめて1回 dispatch する**。送る前なら
// 「戻る」で選び直せる。**`multiSelect` はチェックボックスで複数選べる**（docs/design.md 6.1）。
//
// **何問目を見ているか・どの選択肢に目を置いているかは `stores/question-focus.tsx` が配る**
// （メインビューの比較も同じ選択に従うため。`index` をここのローカル状態に戻さないこと）。
//
// **`answer.labels[i]` は `questions[i]` に対して選んだ答えの並び**（`shared/pending-ask.ts` の
// 契約）。複数選択で2つ以上選んだときはそのまま複数の要素として送り、自由入力に書いた文字列は
// 同じ並びの末尾に足す。**1つの文字列に畳むのはここではない**（SDK が求める
// 「質問1件に対して1つの文字列」へ畳むのは `src/server/core/pending-answer.ts` の役目。ここで畳むと、
// メインビューに残す記録の側で選択肢と突き合わせられなくなる）。
//
// **選択肢はモデルが送ってきた順ではなくラベルの辞書順で出す**（`shared/question.ts` の
// `sortQuestionOptions`。docs/requirements.md 4.2。並べ替えは表示だけの都合
// なので、答えは選んだ「ラベル」で持ち、並べ替えても `answer.labels[i]` の中身は崩れない）。

import { useState, type KeyboardEvent } from "react"

import { type PendingAsk } from "../../../../shared/pending-ask.ts"
import {
  FREE_TEXT_OPTION_LABEL,
  sortQuestionOptions,
  type Question,
} from "../../../../shared/question.ts"
import { useQuestionFocus } from "../../../stores/question-focus.tsx"
import { useSessionDispatch } from "../../../stores/session.tsx"

/**
 * 選択肢の1行。**自由入力欄は選択肢の有無によらず常に1つ出す**（モデルが選択肢に「その他」を
 * 含めてこなかったときの受け皿。モデルが自分で足したときは、その位置に出して二重にしない）。
 */
export type QuestionOptionRow =
  | { readonly kind: "free-text" }
  | {
      readonly kind: "checkbox"
      readonly label: string
      readonly description: string
      readonly checked: boolean
    }
  | {
      readonly kind: "single"
      readonly label: string
      readonly description: string
      readonly selected: boolean
    }

/** 質問1問ぶんの札（`components/question-card.tsx` がそのまま置く）。 */
export type QuestionCardModel = {
  /** 見出し。複数選択なら「（複数選べる）」まで付けたもの。 */
  readonly header: string
  readonly text: string
  /** 比較がメインビューに出ている案内を出すか（選択肢のどれかが `preview` を持つとき）。 */
  readonly showPreviewHint: boolean
  /** **並びはラベルの辞書順**（自由入力は末尾）。 */
  readonly options: readonly QuestionOptionRow[]
  readonly freeText: string
  readonly onSelectSingle: (label: string) => void
  readonly onToggleMulti: (label: string) => void
  readonly onFreeTextChange: (value: string) => void
  /** 自由入力欄の `keydown`。**Enter で進む**（送るボタンは箱の下の1つに統一してある）。 */
  readonly onFreeTextKeyDown: (event: Pick<KeyboardEvent, "key" | "preventDefault">) => void
  /** 目を置いた選択肢をメインビューの比較へ伝える。 */
  readonly onFocusOption: (label: string) => void
}

/** いま何問目か。**質問が2件以上のときだけ出す**。 */
export type QuestionProgress =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      readonly label: string
      /** 「戻る」を出すか（2問目以降）。 */
      readonly showBack: boolean
    }

/** 箱の下の進むボタン。**単一選択で自由入力が空のときは、選んだ瞬間に進むので出さない**。 */
export type QuestionAdvance =
  | { readonly kind: "hidden" }
  | { readonly kind: "shown"; readonly label: string; readonly disabled: boolean }

/** `<QuestionAsk>` が画面に出す形。見ている位置に質問が無いときは `hidden`（何も描かない）。 */
export type QuestionAskModel =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      readonly progress: QuestionProgress
      readonly card: QuestionCardModel
      readonly advance: QuestionAdvance
      readonly onBack: () => void
      readonly onAdvance: () => void
    }

export function useQuestionAsk(
  pending: Extract<PendingAsk, { readonly kind: "question" }>,
): QuestionAskModel {
  const dispatch = useSessionDispatch()
  const questions = pending.questions
  // 答えは質問ごとに持ち続ける（「戻る」で前の質問に戻ったとき、選んだものが残っているように）。
  const [selections, setSelections] = useState<readonly (readonly string[])[]>(
    questions.map(() => []),
  )
  const [freeTexts, setFreeTexts] = useState<readonly string[]>(questions.map(() => ""))
  // 何問目を見ているかはメインビューの比較も読むので、ここではなく store が持つ。
  const { questionIndex: index, setQuestionIndex: setIndex, setFocusedLabel } = useQuestionFocus()

  const question = questions[index]
  if (question === undefined) {
    return { kind: "hidden" }
  }

  const answerFor = (target: number): readonly string[] => {
    const freeText = freeTexts[target]?.trim() ?? ""
    const selected = selections[target] ?? []
    return freeText === "" ? selected : [...selected, freeText]
  }

  /**
   * `target` 番目の答えだけ `answer` に差し替えて `labels` を組む。
   * 選んだ直後に送るときは `setSelections` の結果をまだ読めないため、状態ではなく引数から組む。
   * 返りが可変なのは、コマンド（`shared/command.ts`）の zod スキーマが `string[][]` を
   * 要求するため。
   */
  const labelsWith = (target: number, answer: readonly string[]): string[][] =>
    questions.map((_, i) => [...(i === target ? answer : answerFor(i))])

  const advance = (target: number, answer: readonly string[]): void => {
    if (target < questions.length - 1) {
      setIndex(target + 1)
      // 次の質問の選択肢に、前の質問で置いた目が残らないようにする。
      setFocusedLabel(undefined)
      return
    }
    dispatch({
      type: "answer",
      id: pending.id,
      answer: { kind: "answers", labels: labelsWith(target, answer) },
    })
  }

  const freeText = freeTexts[index] ?? ""
  const currentAnswer = answerFor(index)

  return {
    kind: "shown",
    progress:
      questions.length > 1
        ? {
            kind: "shown",
            label: `${String(questions.length)}問中${String(index + 1)}問目`,
            showBack: index > 0,
          }
        : { kind: "hidden" },
    card: {
      header: `${question.header}${question.multiSelect ? "（複数選べる）" : ""}`,
      text: question.text,
      showPreviewHint: question.options.some((option) => option.preview !== undefined),
      options: optionRows(question, selections[index] ?? []),
      freeText,
      onSelectSingle: (label) => {
        setSelections((current) => current.map((selected, i) => (i === index ? [label] : selected)))
        // 単一選択は「選択肢」と「自由入力」の排他。選び直したら前に打った文字は捨てる。
        setFreeTexts((current) => current.map((existing, i) => (i === index ? "" : existing)))
        advance(index, [label])
      },
      onToggleMulti: (label) => {
        setSelections((current) =>
          current.map((selected, i) => {
            if (i !== index) {
              return selected
            }
            return selected.includes(label)
              ? selected.filter((candidate) => candidate !== label)
              : [...selected, label]
          }),
        )
      },
      onFreeTextChange: (value) => {
        setFreeTexts((current) => current.map((existing, i) => (i === index ? value : existing)))
        if (!question.multiSelect && value.trim() !== "") {
          // 打っている最中に、直前に押した選択肢が光ったままにならないようにする。
          setSelections((current) => current.map((selected, i) => (i === index ? [] : selected)))
        }
      },
      onFreeTextKeyDown: (event) => {
        if (event.key !== "Enter" || freeText.trim() === "") {
          return
        }
        event.preventDefault()
        advance(index, currentAnswer)
      },
      onFocusOption: setFocusedLabel,
    },
    // 単一選択で自由入力が空のときは、選んだ瞬間に進むのでボタンを出さない。
    advance:
      question.multiSelect || freeText.trim() !== ""
        ? {
            kind: "shown",
            label: index === questions.length - 1 ? "答える" : "次へ",
            disabled: currentAnswer.length === 0,
          }
        : { kind: "hidden" },
    onBack: () => {
      setIndex(index - 1)
      setFocusedLabel(undefined)
    },
    onAdvance: () => {
      advance(index, currentAnswer)
    },
  }
}

/**
 * 選択肢を行へ畳む。**並びはラベルの辞書順**（docs/requirements.md 4.2。自由入力は
 * `sortQuestionOptions` が末尾に固定する）。モデルが自由入力を含めてこなかったときは末尾に足す。
 */
function optionRows(question: Question, selected: readonly string[]): readonly QuestionOptionRow[] {
  const rows = sortQuestionOptions(question.options).map((option): QuestionOptionRow => {
    if (option.label === FREE_TEXT_OPTION_LABEL) {
      return { kind: "free-text" }
    }
    return question.multiSelect
      ? {
          kind: "checkbox",
          label: option.label,
          description: option.description,
          checked: selected.includes(option.label),
        }
      : {
          kind: "single",
          label: option.label,
          description: option.description,
          selected: selected.includes(option.label),
        }
  })
  return rows.some((row) => row.kind === "free-text") ? rows : [...rows, { kind: "free-text" }]
}
