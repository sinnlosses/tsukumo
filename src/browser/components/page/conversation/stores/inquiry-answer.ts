// お伺い（答え待ちの許可要求と質問）に対する答えの組み立て。
// お伺いのカードはメインビューに出て、質問の自由入力は入力欄が担うので、1つの状態を2つの領域が読み書きする。
//
// store が持つのは組み立て中の答えだけ（何問目を見ているか・問ごとに選んだラベル・入力欄に書いて記録した答え）。
// 許可要求は選択肢「許可」「拒否」の、自動判定の拒否は「一度だけ許可」「断る」の1問として同じ形で持つ。
// 答え待ちそのものは `SessionState` から来るので、それを読んで画面に出す形へ畳むのは `useInquiryAnswer`。
//
// `answer.answers[i]` は `questions[i]` に対する答え（`PendingAsk` の契約。選んだか任せたか）。
// 複数選択で2つ以上選んだときはそのまま複数の要素として送り、入力欄に書いた文字列は同じ並びの末尾に足す。
// SDK が求める「質問1件に対して1つの文字列」へ畳むのはサーバの役目で、ここで畳むとメインビューに残す記録の側で選択肢と突き合わせられなくなる。

import type { FigureBlock } from "../../../../../shared/report/report-block.ts"
import type { ReportImageSize } from "../../../../../shared/report/report-image.ts"
import type { StampedPendingAsk } from "../../../../../shared/session-driver/pending-ask.ts"
import type { StampedPermissionDenial } from "../../../../../shared/session-driver/permission-denial.ts"
import type {
  QuestionBrief,
  QuestionBriefFact,
  QuestionBriefOption,
  QuestionBriefRecommended,
} from "../../../../../shared/session-driver/question-brief.ts"
import {
  FREE_TEXT_OPTION_LABEL,
  isRecommendedLabel,
  sortQuestionOptions,
  type Question,
  type QuestionAnswer,
  withoutRecommendedMark,
} from "../../../../../shared/session-driver/question.ts"
import { toolInputText } from "../../../../domain/tool-summary.ts"
import { useSession, type SessionDispatch } from "../../../../stores/session.ts"
import { useComposerDraft } from "./composer-draft.ts"
import {
  useInquiryDraft,
  useInquiryFocus,
  type DraftAnswer,
  type InquiryFocus,
} from "./inquiry-draft.ts"

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
  readonly preview?: string
  readonly selected: boolean
  /** 選ぶとあとで戻せないか（添え書きが無ければ false）。 */
  readonly irreversible: boolean
  readonly figures: readonly FigureBlock[]
}

/** 質問の添え書きのうち、選択肢の外に出す分。選択肢ごとの分は {@link InquiryOptionRow} が持つ。 */
export type InquiryBrief = {
  readonly whyAsk: string
  readonly facts: readonly QuestionBriefFact[]
  readonly recommended?: QuestionBriefRecommended
}

export type InquiryFocusedLabel =
  | { readonly kind: "none" }
  | { readonly kind: "option"; readonly label: string }

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
  /** 詳細のサーフェスに出す選択肢。触った選択肢、無ければ最後に選んだもの。どちらも無ければ `none`（詳細は出さない）。 */
  readonly focusedLabel: InquiryFocusedLabel
  readonly onFocus: (label: string) => void
  /** 「これで答える」を押せるか（何も選ばず何も書いていなければ押せない）。 */
  readonly canAnswer: boolean
  /** 戻せない選択肢を選んでいるあいだ `twice`（⏎ だけでは確定せず、⇧⏎ かクリックで確定する）。 */
  readonly confirm: "once" | "twice"
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
  /** 自動判定の拒否。入力は持たず、理由の要約だけを出す。 */
  | (InquiryCommon & {
      readonly kind: "denial"
      readonly toolName: string
      readonly reason: string
    })
  | (InquiryCommon & {
      readonly kind: "question"
      readonly header: string
      readonly brief?: InquiryBrief
      readonly imageSizes: readonly ReportImageSize[]
      readonly unshelvedImages: readonly string[]
      readonly text: string
      /** この問に対して入力欄に書いて記録した答え（まだ送っていない。無ければ空文字）。 */
      readonly writtenAnswer: string
      /** 単一選択の問で、入力欄に字があるあいだ true（札は選択肢を薄くして入力欄の答えで答える旨を出す）。 */
      readonly writing: boolean
      /** 入力欄に書いた字でこの問に答える（最後の1問なら全問ぶんを送る）。 */
      readonly onAnswerWithText: (text: string) => void
      /** この問の判断を任せて確定し、次の問へ進む（最後の1問なら全問ぶんを送る）。入力欄の字は使わず残す。 */
      readonly onEntrust: () => void
      /** 「任せる」の口。おすすめが戻せない案のときは出さない。 */
      readonly entrust: InquiryEntrust
    })

export type InquiryEntrust =
  | { readonly kind: "hidden" }
  | { readonly kind: "offered"; readonly label: string }

/**
 * 答え待ちを先に、無ければ自動判定の拒否の先頭を畳む（答え待ちは SDK が応答を待って止まっているので先に答えてもらう）。
 */
export function useInquiryAnswer(): InquiryModel {
  const pending = useSession((session) => session.state.pending[0])
  const denial = useSession((session) => session.state.permissionDenials[0])
  const dispatch = useSession((session) => session.dispatch)
  const draft = useInquiryDraft((state) => state.draft)
  const touched = useInquiryFocus((state) => state.focus)
  const composerWriting = useComposerDraft((state) => state.draft.text !== "")

  if (pending === undefined) {
    if (denial === undefined) {
      return { kind: "none" }
    }
    const answer = draft?.pendingId === denial.toolUseId ? draft.answer : EMPTY_DRAFT_ANSWER
    return denialModel(
      denial,
      {
        answer,
        setAnswer: (next) => {
          useInquiryDraft.setState({ draft: { pendingId: denial.toolUseId, answer: next } })
        },
      },
      dispatch,
    )
  }
  // 別の答え待ちに対して組み立てていた答えは読まない（別の答え待ちが来た・答え終わった）。
  const answer = draft?.pendingId === pending.id ? draft.answer : EMPTY_DRAFT_ANSWER
  const setAnswer = (next: DraftAnswer): void => {
    useInquiryDraft.setState({ draft: { pendingId: pending.id, answer: next } })
  }
  return pending.kind === "permission"
    ? permissionModel(pending, { answer, setAnswer }, dispatch)
    : questionModel(pending, { answer, setAnswer }, touched, composerWriting, dispatch)
}

/**
 * 選択肢を札の行へ畳む。並びはおすすめ → それ以外の辞書順（`sortQuestionOptions`）で、番号はその並びで振る。
 *
 * 自由入力（「その他」）の選択肢は札に出さない（自由入力は入力欄が担うので、押しても意味のない札になる）。
 * `sortQuestionOptions` はそれでも通すので、モデルが「その他」を含めてきたかどうかで残りの並びは変わらない。
 */
export function optionRows(
  question: Question,
  selected: readonly string[],
  briefOptions: readonly QuestionBriefOption[],
): readonly InquiryOptionRow[] {
  return sortQuestionOptions(question.options)
    .filter((option) => option.label !== FREE_TEXT_OPTION_LABEL)
    .map((option, index) => {
      const text = withoutRecommendedMark(option.label)
      const briefed = briefOptions.find(
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
        figures: briefed?.figures ?? [],
      }
    })
}

export function inquiryBriefOf(brief: QuestionBrief): InquiryBrief {
  return { whyAsk: brief.whyAsk, facts: brief.facts, recommended: brief.recommended }
}

/** 許可する側と拒む側の選択肢のラベル。並びがそのまま番号になる。 */
type AllowOrDenyLabels = readonly [allow: string, deny: string]

const PERMISSION_LABELS = ["許可", "拒否"] as const satisfies AllowOrDenyLabels
const DENIAL_LABELS = ["一度だけ許可", "断る"] as const satisfies AllowOrDenyLabels

const EMPTY_DRAFT_ANSWER: DraftAnswer = {
  index: 0,
  selections: [],
  writtenAnswers: [],
  entrusted: [],
}

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
  return {
    ...allowOrDeny(pending.id, pending.askedAt, PERMISSION_LABELS, draft, dispatch),
    kind: "permission",
    toolName: pending.toolName,
    targetText: toolInputText(pending.toolName, pending.input),
  }
}

/** 自動判定の拒否1件を、選択肢「一度だけ許可」「断る」の1問として畳む。 */
function denialModel(
  denial: StampedPermissionDenial,
  draft: InquiryDraft,
  dispatch: SessionDispatch,
): InquiryModel {
  return {
    ...allowOrDeny(denial.toolUseId, denial.deniedAt, DENIAL_LABELS, draft, dispatch),
    kind: "denial",
    toolName: denial.toolName,
    reason: denial.reason,
  }
}

/** 選択肢2つ（先が許可・後が拒否）の1問。選んだ答えは `allow` / `deny` として送る。 */
function allowOrDeny(
  id: string,
  askedAt: number,
  labels: AllowOrDenyLabels,
  draft: InquiryDraft,
  dispatch: SessionDispatch,
): InquiryCommon {
  const chosen = draft.answer.selections[0]?.[0]
  const [allowLabel] = labels
  const send = (label: string): void => {
    void dispatch.session.answer({
      id,
      answer: { kind: label === allowLabel ? "allow" : "deny" },
    })
  }
  return {
    id,
    askedAt,
    multiSelect: false,
    progressLabel: "1 / 1",
    questionCount: 1,
    showBack: false,
    last: true,
    focusedLabel: { kind: "option", label: chosen ?? allowLabel },
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
      figures: [],
    })),
    canAnswer: chosen !== undefined,
    confirm: "once",
    onToggle: (label) => {
      draft.setAnswer({ ...draft.answer, selections: [[label]] })
    },
    onChoose: send,
    onAnswer: () => {
      if (chosen === undefined) {
        return
      }
      send(chosen)
    },
    onBack: () => {},
  }
}

/** 答え待ちの質問1件ぶんを、札と入力欄がそのまま置ける形へ畳む。 */
function questionModel(
  pending: Extract<StampedPendingAsk, { readonly kind: "question" }>,
  draft: InquiryDraft,
  touched: InquiryFocus,
  composerWriting: boolean,
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

  const answersWith = (current: QuestionAnswer) =>
    questions.map((_, i) => {
      const answer = i === index ? current : savedAnswer(draft.answer, i)
      return answer.kind === "chosen"
        ? { kind: "chosen" as const, labels: [...answer.labels] }
        : answer
    })

  /**
   * この問の答え（選んだラベルと、入力欄に書いた答え。または任せた）を確定して次へ進む。
   * 最後の1問なら全問ぶんを1回で送る。
   */
  const advance = (choices: readonly string[], written: string, entrust = false): void => {
    if (!last) {
      draft.setAnswer({
        index: index + 1,
        selections: entrust
          ? draft.answer.selections
          : replaced(draft.answer.selections, index, choices, []),
        writtenAnswers: entrust
          ? draft.answer.writtenAnswers
          : replaced(draft.answer.writtenAnswers, index, written, ""),
        entrusted: replaced(draft.answer.entrusted, index, entrust, false),
      })
      return
    }
    void dispatch.session.answer({
      id: pending.id,
      answer: {
        kind: "answers",
        answers: answersWith(
          entrust
            ? { kind: "entrusted" }
            : { kind: "chosen", labels: written === "" ? choices : [...choices, written] },
        ),
      },
    })
  }

  const canAnswer = selected.length > 0 || writtenAnswer !== ""
  const brief = pending.briefs.find((candidate) => candidate.header === question.header)
  const options = optionRows(question, selected, brief?.options ?? [])
  const touchedLabel =
    touched.kind === "touched" && touched.pendingId === pending.id && touched.index === index
      ? options.find((option) => option.label === touched.label)?.label
      : undefined
  const setFocus = (label: string): void => {
    useInquiryFocus.setState({ focus: { kind: "touched", pendingId: pending.id, index, label } })
  }

  return {
    kind: "question",
    id: pending.id,
    askedAt: pending.askedAt,
    header: question.header,
    brief: brief === undefined ? undefined : inquiryBriefOf(brief),
    imageSizes: pending.imageSizes,
    unshelvedImages: pending.unshelvedImages,
    text: question.text,
    multiSelect: question.multiSelect,
    progressLabel: `${String(index + 1)} / ${String(questions.length)}`,
    questionCount: questions.length,
    showBack: index > 0,
    last,
    options,
    focusedLabel: focusedLabelOf(touchedLabel ?? selected.at(-1)),
    onFocus: setFocus,
    writtenAnswer,
    writing: !question.multiSelect && composerWriting,
    canAnswer,
    confirm: options.some((option) => option.selected && option.irreversible) ? "twice" : "once",
    entrust: entrustOf(options),
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
        entrusted: replaced(draft.answer.entrusted, index, false, false),
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
    onEntrust: () => {
      advance([], "", true)
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

/**
 * 「任せる」の口。SDK へ返す文（`ENTRUSTED_ANSWER`）は、おすすめがあればそれを、無ければ戻せる案を選ぶ。
 * 選ばれる案を名指せるのは、おすすめ（並びの先頭）があるときだけ。
 */
function entrustOf(options: readonly InquiryOptionRow[]): InquiryEntrust {
  const recommended = options.find((option) => option.recommended)
  if (recommended === undefined) {
    return { kind: "offered", label: ENTRUST_UNNAMED_LABEL }
  }
  return recommended.irreversible
    ? { kind: "hidden" }
    : { kind: "offered", label: `おすすめに任せる（${recommended.text}）` }
}

const ENTRUST_UNNAMED_LABEL = "任せる（戻せる案から選ぶ）"

function focusedLabelOf(label?: string): InquiryFocusedLabel {
  return label === undefined ? { kind: "none" } : { kind: "option", label }
}

function savedAnswer(answer: DraftAnswer, target: number): QuestionAnswer {
  if (answer.entrusted[target] === true) {
    return { kind: "entrusted" }
  }
  const written = answer.writtenAnswers[target] ?? ""
  const selected = answer.selections[target] ?? []
  return { kind: "chosen", labels: written === "" ? selected : [...selected, written] }
}

/**
 * 並びの `target` 番目だけ差し替える。まだ届いていない位置は `filler` で埋める。
 * 問ごとの答えは触った問だけ入るので、後ろの問から先に触られることがある。
 */
function replaced<T>(values: readonly T[], target: number, value: T, filler: T): readonly T[] {
  const length = Math.max(values.length, target + 1)
  return Array.from({ length }, (_, i) => (i === target ? value : (values[i] ?? filler)))
}
