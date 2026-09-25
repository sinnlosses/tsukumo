// 答え待ちの質問に対する**答えの組み立て**を配る Context（`<QuestionAnswerProvider>`）と、
// 両側が読む1つのモデル（{@link useQuestionAnswer}）。
//
// **質問の札はメインビュー（`components/page/conversation/main-view/question-ask.tsx`）に出て、自由入力は入力欄
// （`components/page/conversation/dispatch/`）が担う**ので、1つの状態を2つの領域が読み書きする。`browser/` の機能
// どうしは import できない（docs/design.md 2章、`test/architecture.test.ts`）ため、置き場所は
// 「画面全体で共有する状態」の `browser/stores/`（docs/design.md 6.2）。
//
// **Context が持つのは組み立て中の答えだけ**（何問目を見ているか・質問ごとに選んだラベル・
// 入力欄に書いて記録した答え）。質問そのものは `SessionState` から来るので、それを読んで
// 画面に出す形へ畳むのは {@link useQuestionAnswer}——**読む側ごとに購読する**ので、Provider は
// 答え待ちの id しか読まない（中身まで読むと、Provider の下＝画面全体が描き直しになる）。
//
// **`SessionState` には入れない。** サーバから来るものではなく、画面の都合の状態だから
// （`stores/turn-selection.tsx` と同じ理由）。
//
// **`answer.labels[i]` は `questions[i]` に対して選んだ答えの並び**（`shared/pending-ask.ts` の
// 契約）。複数選択で2つ以上選んだときはそのまま複数の要素として送り、入力欄に書いた文字列は
// 同じ並びの末尾に足す。**1つの文字列に畳むのはここではない**（SDK が求める
// 「質問1件に対して1つの文字列」へ畳むのは `src/server/session-driver/core/pending-answer.ts` の役目。ここで畳むと、
// メインビューに残す記録の側で選択肢と突き合わせられなくなる）。

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { type PendingAsk } from "../../shared/pending-ask.ts"
import {
  FREE_TEXT_OPTION_LABEL,
  sortQuestionOptions,
  type Question,
} from "../../shared/question.ts"
import { useSessionDispatch, useSessionSelector, type SessionDispatch } from "./session.tsx"

/**
 * 選択肢1つぶんの札。**`label` は SDK へ返す元のラベル**で、`text` は画面に出す字
 * （末尾の `(Recommended)` を外したもの。外した印は {@link QuestionOptionRow.recommended}）。
 */
export type QuestionOptionRow = {
  readonly label: string
  readonly text: string
  readonly recommended: boolean
  readonly description: string
  readonly preview: string | undefined
  readonly selected: boolean
}

/** 答え待ちの質問が無ければ `none`（札も入力欄の帯も出ない）。 */
export type QuestionAnswerModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "asking"
      /** 答え待ちの id（`PendingAsk.id`）。**別の質問に入れ替わった合図**として読む。 */
      readonly id: string
      readonly header: string
      readonly text: string
      readonly multiSelect: boolean
      /** 「1 / 2」。質問が1件でも出す（モックの右端）。 */
      readonly progressLabel: string
      /** 「戻る」を出すか（2問目以降）。 */
      readonly showBack: boolean
      /** いま見ているのが最後の1問か（答えると全問ぶんを送る）。 */
      readonly last: boolean
      /** **並びはラベルの辞書順**（`sortQuestionOptions`）。 */
      readonly options: readonly QuestionOptionRow[]
      /** この問に対して入力欄に書いて記録した答え（まだ送っていない。無ければ空文字）。 */
      readonly writtenAnswer: string
      /** 「これで答える」を押せるか（何も選ばず何も書いていなければ押せない）。 */
      readonly canAnswer: boolean
      readonly onToggle: (label: string) => void
      readonly onAnswer: () => void
      readonly onBack: () => void
      /** 入力欄に書いた字でこの問に答える（最後の1問なら全問ぶんを送る）。 */
      readonly onAnswerWithText: (text: string) => void
    }

export type QuestionAnswerProviderProps = {
  readonly children: ReactNode
}

/** `<QuestionAnswerProvider>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
export function useQuestionAnswer(): QuestionAnswerModel {
  const draft = useContext(QuestionAnswerContext)
  if (draft === undefined) {
    throw new Error("useQuestionAnswer は <QuestionAnswerProvider> の内側でだけ呼べる")
  }
  const pending = useSessionSelector((session) => session.state.pending[0])
  const dispatch = useSessionDispatch()

  if (pending === undefined || pending.kind !== "question") {
    return { kind: "none" }
  }
  return askingModel(pending, draft, dispatch)
}

export function QuestionAnswerProvider(props: QuestionAnswerProviderProps): ReactElement {
  // 答え待ちの id だけを読む（中身まで読むと、質問の並びが同じでも参照が変わるたびに
  // Provider の下＝画面全体を描き直すことになる）。
  const pendingId = useSessionSelector((session) => session.state.pending[0]?.id)

  const [answer, setAnswer] = useState<DraftAnswer>(EMPTY_DRAFT_ANSWER)
  const [shownPendingId, setShownPendingId] = useState<string | undefined>(undefined)

  // 答え待ちが入れ替わったら（別の質問が来た・答え終わった）組み立て中の答えを捨てる。
  // 捨てるのは**レンダー中に見比べて**決める（画面の外と同期する処理ではないので `useEffect` は
  // 使わない。docs/coding-standards.md「useEffect の代わりに使うもの」）。
  if (shownPendingId !== pendingId) {
    setShownPendingId(pendingId)
    setAnswer(EMPTY_DRAFT_ANSWER)
  }

  const value = useMemo<QuestionDraft>(() => ({ answer, setAnswer }), [answer])

  return (
    <QuestionAnswerContext.Provider value={value}>{props.children}</QuestionAnswerContext.Provider>
  )
}

/**
 * 組み立て中の答え。**質問ごとに持ち続ける**（「戻る」で前の質問に戻ったとき、選んだものが
 * 残っているように）。`selections[i]` / `writtenAnswers[i]` は `questions[i]` に対応し、
 * まだ触っていない問の位置は空のまま（読む側が `?? []` / `?? ""` で受ける）。
 */
type DraftAnswer = {
  readonly index: number
  readonly selections: readonly (readonly string[])[]
  readonly writtenAnswers: readonly string[]
}

const EMPTY_DRAFT_ANSWER: DraftAnswer = { index: 0, selections: [], writtenAnswers: [] }

type QuestionDraft = {
  readonly answer: DraftAnswer
  readonly setAnswer: (next: DraftAnswer) => void
}

const QuestionAnswerContext = createContext<QuestionDraft | undefined>(undefined)

/** 答え待ちの質問1件ぶんを、札と入力欄がそのまま置ける形へ畳む。 */
function askingModel(
  pending: Extract<PendingAsk, { readonly kind: "question" }>,
  draft: QuestionDraft,
  dispatch: SessionDispatch,
): QuestionAnswerModel {
  const questions = pending.questions
  const index = Math.min(draft.answer.index, questions.length - 1)
  const question = questions[index]
  if (question === undefined) {
    return { kind: "none" }
  }

  const selected = draft.answer.selections[index] ?? []
  const writtenAnswer = draft.answer.writtenAnswers[index] ?? ""
  const last = index === questions.length - 1

  /** `target` 番目の答えだけ差し替えて `labels` を組む。 */
  const labelsWith = (answer: readonly string[]): string[][] =>
    questions.map((_, i) => (i === index ? [...answer] : [...answerFor(draft.answer, i)]))

  /**
   * この問の答え（選んだラベルと、入力欄に書いた答え）を確定して次へ進む。
   * **最後の1問なら全問ぶんを1回で送る**。
   */
  const advance = (choices: readonly string[], written: string): void => {
    if (!last) {
      draft.setAnswer({
        index: index + 1,
        selections: replaced(draft.answer.selections, index, choices, []),
        writtenAnswers: replaced(draft.answer.writtenAnswers, index, written, ""),
      })
      return
    }
    dispatch({
      type: "answer",
      id: pending.id,
      answer: {
        kind: "answers",
        labels: labelsWith(written === "" ? choices : [...choices, written]),
      },
    })
  }

  return {
    kind: "asking",
    id: pending.id,
    header: question.header,
    text: question.text,
    multiSelect: question.multiSelect,
    progressLabel: `${String(index + 1)} / ${String(questions.length)}`,
    showBack: index > 0,
    last,
    options: optionRows(question, selected),
    writtenAnswer,
    canAnswer: selected.length > 0 || writtenAnswer !== "",
    onToggle: (label) => {
      // 単一選択は選び直しで置き換え、複数選択は押すたびに入り切りする。どちらも
      // **選んだ時点で送らない**（送るのは「これで答える」と入力欄の「答える」だけ）。
      const next = question.multiSelect
        ? selected.includes(label)
          ? selected.filter((candidate) => candidate !== label)
          : [...selected, label]
        : [label]
      draft.setAnswer({
        index,
        selections: replaced(draft.answer.selections, index, next, []),
        // 選択肢を選び直したら、入力欄に書いて記録した答えは捨てる（単一選択の排他と同じ）。
        writtenAnswers: question.multiSelect
          ? draft.answer.writtenAnswers
          : replaced(draft.answer.writtenAnswers, index, "", ""),
      })
    },
    onAnswer: () => {
      advance(selected, writtenAnswer)
    },
    onBack: () => {
      draft.setAnswer({ ...draft.answer, index: index - 1 })
    },
    onAnswerWithText: (written) => {
      const trimmed = written.trim()
      if (trimmed === "") {
        return
      }
      // 単一選択は「選択肢」と「入力欄に書いた答え」の排他（書いたほうを採る）。
      advance(question.multiSelect ? selected : [], trimmed)
    },
  }
}

/** `target` 番目の答え（選んだラベル + 入力欄に書いた答え）。 */
function answerFor(answer: DraftAnswer, target: number): readonly string[] {
  const written = answer.writtenAnswers[target] ?? ""
  const selected = answer.selections[target] ?? []
  return written === "" ? selected : [...selected, written]
}

/**
 * 並びの `target` 番目だけ差し替える。**まだ届いていない位置は `filler` で埋める**
 * （質問ごとの答えは触った問だけ入るので、後ろの問から先に触られることがある）。
 */
function replaced<T>(values: readonly T[], target: number, value: T, filler: T): readonly T[] {
  const length = Math.max(values.length, target + 1)
  return Array.from({ length }, (_, i) => (i === target ? value : (values[i] ?? filler)))
}

/**
 * 選択肢を札の行へ畳む。**並びはラベルの辞書順**（`shared/question.ts` の
 * `sortQuestionOptions`。docs/display.md 4.2）。
 *
 * **自由入力（「その他」）の選択肢は札に出さない**（自由入力は入力欄が担うので、押しても
 * 意味のない札になる）。`sortQuestionOptions` は今までどおり通すので、モデルが
 * 「その他」を含めてきたかどうかで残りの並びは変わらない。
 */
function optionRows(question: Question, selected: readonly string[]): readonly QuestionOptionRow[] {
  return sortQuestionOptions(question.options)
    .filter((option) => option.label !== FREE_TEXT_OPTION_LABEL)
    .map((option) => ({
      label: option.label,
      text: option.label.replace(RECOMMENDED_SUFFIX, ""),
      recommended: RECOMMENDED_SUFFIX.test(option.label),
      description: option.description,
      preview: option.preview,
      selected: selected.includes(option.label),
    }))
}

/**
 * ラベル末尾の「おすすめ」の印（`AskUserQuestion` のモデルが自分で書く）。**字からは外して
 * バッジにする**が、**SDK へ返す答えは元のラベルのまま**（`QuestionOptionRow.label`）。
 */
const RECOMMENDED_SUFFIX = /\s*\(Recommended\)\s*$/i
