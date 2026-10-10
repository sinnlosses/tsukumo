// お伺い（答え待ちの許可要求と質問）に対する答えの組み立て。
// お伺いの札はメインビューに出て、質問の自由入力は入力欄が担うので、1つの状態を2つの領域が読み書きする。
//
// store が持つのは組み立て中の答えだけ（何問目を見ているか・問ごとに選んだラベル・入力欄に書いて記録した答え）。
// 許可要求は選択肢「許可」「拒否」の1問として同じ形で持つ。
// 答え待ちそのものは `SessionState` から来るので、それを読んで画面に出す形へ畳むのは `useInquiryAnswer`。
//
// `answer.labels[i]` は `questions[i]` に対して選んだ答えの並び（`PendingAsk` の契約）。
// 複数選択で2つ以上選んだときはそのまま複数の要素として送り、入力欄に書いた文字列は同じ並びの末尾に足す。
// SDK が求める「質問1件に対して1つの文字列」へ畳むのはサーバの役目で、ここで畳むとメインビューに残す記録の側で選択肢と突き合わせられなくなる。

import { create } from "zustand"

import type { FigureBlock } from "../../shared/report/report-block.ts"
import type { StampedPendingAsk } from "../../shared/session-driver/pending-ask.ts"
import type { QuestionBrief } from "../../shared/session-driver/question-brief.ts"
import {
  FREE_TEXT_OPTION_LABEL,
  isRecommendedLabel,
  sortQuestionOptions,
  type Question,
  withoutRecommendedMark,
} from "../../shared/session-driver/question.ts"
import { toolInputText } from "../domain/tool-summary.ts"
import { useSession, type SessionDispatch } from "./session.ts"

/**
 * 選択肢1つぶんの札。`label` は SDK へ返す元のラベル（許可要求では「許可」「拒否」）で、`text` は画面に出す字。
 * `text` は末尾のおすすめの印（`withoutRecommendedMark`）を外したもので、外した印は {@link InquiryOptionRow.recommended}。
 * `number` は 1 から振った番号（数字キーで選ぶときの番号）。
 */
export type InquiryOptionRow = {
  readonly number: number
  readonly label: string
  readonly text: string
  readonly recommended: boolean
  readonly description: string
  readonly preview: string | undefined
  readonly selected: boolean
  /** 選ぶとあとで戻せないか（添え書きが無ければ false）。 */
  readonly irreversible: boolean
  readonly pros: readonly string[]
  readonly cons: readonly string[]
  /** 判断の軸ごとの評価。`InquiryBrief.axes` と同じ並び（添え書きが無ければ空）。 */
  readonly byAxis: readonly string[]
  readonly figures: readonly FigureBlock[]
}

/** 質問の添え書きのうち、選択肢の外に出す分。選択肢ごとの分は {@link InquiryOptionRow} が持つ。 */
export type InquiryBrief = {
  readonly background: string
  readonly axes: readonly string[]
}

/** 許可要求と質問のどちらにもある欄。 */
type InquiryCommon = {
  /** 答え待ちの id（`PendingAsk.id`）。別の答え待ちに入れ替わった合図として読む。 */
  readonly id: string
  /** 答え待ちが届いた時刻（エポックミリ秒）。 */
  readonly askedAt: number
  readonly multiSelect: boolean
  /** 「1 / 2」。1問でも出す。 */
  readonly progressLabel: string
  readonly questionCount: number
  /** 「戻る」を出すか（2問目以降）。 */
  readonly showBack: boolean
  /** いま見ているのが最後の1問か（答えると全問ぶんを送る）。 */
  readonly last: boolean
  readonly options: readonly InquiryOptionRow[]
  /** 詳細の面に出す選択肢の `label`。触った選択肢、無ければ最後に選んだもの、それも無ければ先頭。 */
  readonly focusedLabel: string
  readonly onFocus: (label: string) => void
  /** 「これで答える」を押せるか（何も選ばず何も書いていなければ押せない）。 */
  readonly canAnswer: boolean
  readonly onToggle: (label: string) => void
  /** 選んだ瞬間に答える（許可と単一選択。複数選択では使わない）。 */
  readonly onChoose: (label: string) => void
  readonly onAnswer: () => void
  readonly onBack: () => void
}

/**
 * 答え待ちが無ければ `none`（札も入力欄の帯も出ない）。
 * `permission` の `targetText` は対象の全文（切り詰めない）。
 */
export type InquiryModel =
  | { readonly kind: "none" }
  | (InquiryCommon & {
      readonly kind: "permission"
      readonly toolName: string
      readonly targetText: string
    })
  | (InquiryCommon & {
      readonly kind: "question"
      readonly header: string
      readonly brief: InquiryBrief | undefined
      readonly text: string
      /** この問に対して入力欄に書いて記録した答え（まだ送っていない。無ければ空文字）。 */
      readonly writtenAnswer: string
      /** 入力欄に書いた字でこの問に答える（最後の1問なら全問ぶんを送る）。 */
      readonly onAnswerWithText: (text: string) => void
    })

export function useInquiryAnswer(): InquiryModel {
  const pending = useSession((session) => session.state.pending[0])
  const dispatch = useSession((session) => session.dispatch)
  const draft = useInquiryDraft((state) => state.draft)
  const touched = useInquiryFocus((state) => state.focus)

  if (pending === undefined) {
    return { kind: "none" }
  }
  // 別の答え待ちに対して組み立てていた答えは読まない（別の答え待ちが来た・答え終わった）。
  const answer = draft?.pendingId === pending.id ? draft.answer : EMPTY_DRAFT_ANSWER
  const setAnswer = (next: DraftAnswer): void => {
    useInquiryDraft.setState({ draft: { pendingId: pending.id, answer: next } })
  }
  return pending.kind === "permission"
    ? permissionModel(pending, { answer, setAnswer }, dispatch)
    : questionModel(pending, { answer, setAnswer }, touched, dispatch)
}

export type InquiryDraftState = {
  /** どの答え待ち（`PendingAsk.id`）に対して組み立てている答えか。まだ何も触っていなければ undefined。 */
  readonly draft: { readonly pendingId: string; readonly answer: DraftAnswer } | undefined
}

export const useInquiryDraft = create<InquiryDraftState>()(() => ({ draft: undefined }))

export type InquiryFocusState = {
  /** 詳細の面に出すと触って決めた選択肢。どの答え待ちの何問目かも持ち、別の問に替われば読まない。 */
  readonly focus:
    | { readonly pendingId: string; readonly index: number; readonly label: string }
    | undefined
}

export const useInquiryFocus = create<InquiryFocusState>()(() => ({ focus: undefined }))

/** 許可要求の選択肢のラベル。並びがそのまま番号になる。 */
const ALLOW_LABEL = "許可"
const DENY_LABEL = "拒否"

/**
 * 組み立て中の答え。問ごとに持ち続ける（「戻る」で前の問に戻ったとき、選んだものが残っているように）。
 * `selections[i]` / `writtenAnswers[i]` は `questions[i]` に対応し、まだ触っていない問の位置は空のまま（読む側が `?? []` / `?? ""` で受ける）。
 */
type DraftAnswer = {
  readonly index: number
  readonly selections: readonly (readonly string[])[]
  readonly writtenAnswers: readonly string[]
}

const EMPTY_DRAFT_ANSWER: DraftAnswer = { index: 0, selections: [], writtenAnswers: [] }

type InquiryDraft = {
  readonly answer: DraftAnswer
  readonly setAnswer: (next: DraftAnswer) => void
}

/** 許可要求1件を、選択肢「許可」「拒否」の1問として畳む。 */
function permissionModel(
  pending: Extract<StampedPendingAsk, { readonly kind: "permission" }>,
  draft: InquiryDraft,
  dispatch: SessionDispatch,
): InquiryModel {
  const chosen = draft.answer.selections[0]?.[0]
  const labels = [ALLOW_LABEL, DENY_LABEL]
  return {
    kind: "permission",
    id: pending.id,
    askedAt: pending.askedAt,
    toolName: pending.toolName,
    targetText: toolInputText(pending.toolName, pending.input),
    multiSelect: false,
    progressLabel: "1 / 1",
    questionCount: 1,
    showBack: false,
    last: true,
    focusedLabel: chosen ?? ALLOW_LABEL,
    onFocus: () => {},
    options: labels.map((label, index) => ({
      number: index + 1,
      label,
      text: label,
      recommended: false,
      description: "",
      preview: undefined,
      selected: chosen === label,
      irreversible: false,
      pros: [],
      cons: [],
      byAxis: [],
      figures: [],
    })),
    canAnswer: chosen !== undefined,
    onToggle: (label) => {
      draft.setAnswer({ ...draft.answer, selections: [[label]] })
    },
    onChoose: (label) => {
      dispatch.session.answer({
        id: pending.id,
        answer: { kind: label === ALLOW_LABEL ? "allow" : "deny" },
      })
    },
    onAnswer: () => {
      if (chosen === undefined) {
        return
      }
      dispatch.session.answer({
        id: pending.id,
        answer: { kind: chosen === ALLOW_LABEL ? "allow" : "deny" },
      })
    },
    onBack: () => {},
  }
}

/** 答え待ちの質問1件ぶんを、札と入力欄がそのまま置ける形へ畳む。 */
function questionModel(
  pending: Extract<StampedPendingAsk, { readonly kind: "question" }>,
  draft: InquiryDraft,
  touched: InquiryFocusState["focus"],
  dispatch: SessionDispatch,
): InquiryModel {
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
   * 最後の1問なら全問ぶんを1回で送る。
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
    dispatch.session.answer({
      id: pending.id,
      answer: {
        kind: "answers",
        labels: labelsWith(written === "" ? choices : [...choices, written]),
      },
    })
  }

  const canAnswer = selected.length > 0 || writtenAnswer !== ""
  const brief = pending.briefs.find((candidate) => candidate.header === question.header)
  const options = optionRows(question, selected, brief)
  const touchedLabel =
    touched?.pendingId === pending.id && touched.index === index
      ? options.find((option) => option.label === touched.label)?.label
      : undefined
  const setFocus = (label: string): void => {
    useInquiryFocus.setState({ focus: { pendingId: pending.id, index, label } })
  }

  return {
    kind: "question",
    id: pending.id,
    askedAt: pending.askedAt,
    header: question.header,
    brief: brief === undefined ? undefined : { background: brief.background, axes: brief.axes },
    text: question.text,
    multiSelect: question.multiSelect,
    progressLabel: `${String(index + 1)} / ${String(questions.length)}`,
    questionCount: questions.length,
    showBack: index > 0,
    last,
    options,
    focusedLabel: touchedLabel ?? selected.at(-1) ?? options[0]?.label ?? "",
    onFocus: setFocus,
    writtenAnswer,
    canAnswer,
    onToggle: (label) => {
      setFocus(label)
      // 単一選択は選び直しで置き換え、複数選択は押すたびに入り切りする。
      // どちらも選んだ時点で送らない（送るのは「これで答える」と入力欄の「答える」だけ）。
      const next = question.multiSelect
        ? selected.includes(label)
          ? selected.filter((candidate) => candidate !== label)
          : [...selected, label]
        : [label]
      draft.setAnswer({
        index,
        selections: replaced(draft.answer.selections, index, next, []),
        // 選択肢を選び直したら、入力欄に書いて記録した答えは捨てる。
        writtenAnswers: question.multiSelect
          ? draft.answer.writtenAnswers
          : replaced(draft.answer.writtenAnswers, index, "", ""),
      })
    },
    onChoose: (label) => {
      if (question.multiSelect) {
        return
      }
      advance([label], "")
    },
    onAnswer: () => {
      if (!canAnswer) {
        return
      }
      advance(selected, writtenAnswer)
    },
    onBack: () => {
      draft.setAnswer({ ...draft.answer, index: Math.max(0, index - 1) })
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
 * 並びの `target` 番目だけ差し替える。まだ届いていない位置は `filler` で埋める。
 * 問ごとの答えは触った問だけ入るので、後ろの問から先に触られることがある。
 */
function replaced<T>(values: readonly T[], target: number, value: T, filler: T): readonly T[] {
  const length = Math.max(values.length, target + 1)
  return Array.from({ length }, (_, i) => (i === target ? value : (values[i] ?? filler)))
}

/**
 * 選択肢を札の行へ畳む。並びはおすすめ → それ以外の辞書順（`sortQuestionOptions`）で、番号はその並びで振る。
 *
 * 自由入力（「その他」）の選択肢は札に出さない（自由入力は入力欄が担うので、押しても意味のない札になる）。
 * `sortQuestionOptions` はそれでも通すので、モデルが「その他」を含めてきたかどうかで残りの並びは変わらない。
 */
function optionRows(
  question: Question,
  selected: readonly string[],
  brief: QuestionBrief | undefined,
): readonly InquiryOptionRow[] {
  return sortQuestionOptions(question.options)
    .filter((option) => option.label !== FREE_TEXT_OPTION_LABEL)
    .map((option, index) => {
      const text = withoutRecommendedMark(option.label)
      const briefed = brief?.options.find(
        (candidate) => withoutRecommendedMark(candidate.label) === text,
      )
      return {
        number: index + 1,
        label: option.label,
        text,
        recommended: isRecommendedLabel(option.label),
        description: option.description,
        preview: option.preview,
        selected: selected.includes(option.label),
        irreversible: briefed?.irreversible ?? false,
        pros: briefed?.pros ?? [],
        cons: briefed?.cons ?? [],
        byAxis: briefed?.byAxis ?? [],
        figures: briefed?.figures ?? [],
      }
    })
}
