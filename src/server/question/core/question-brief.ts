// 質問の添え書きの、`question_brief` を呼んだ時点の検査と、届いた `AskUserQuestion` との突き合わせ。
// 理由の文はモデルへ返すだけで、ログにもファイルにも書かない（添え書きの字が入る）。

import { unique } from "remeda"

import type { QuestionBrief } from "../../../shared/session-driver/question-brief.ts"
import {
  FREE_TEXT_OPTION_LABEL,
  isRecommendedLabel,
  type Question,
  withoutRecommendedMark,
} from "../../../shared/session-driver/question.ts"

/** `AskUserQuestion` が1回に持てる質問の数と同じ。 */
const MAX_BRIEF_QUESTIONS = 4
/** `AskUserQuestion` が1問に持てる選択肢の数と同じ。 */
const MIN_BRIEF_OPTIONS = 2
const MAX_BRIEF_OPTIONS = 4
const MIN_BRIEF_FACTS = 1
const MAX_BRIEF_FACTS = 5
const MAX_OPTION_FIGURES = 2

/** 選択肢が2つ以上の質問に添え書きを求める。自由入力の選択肢は数えない。 */
const MIN_OPTIONS_NEEDING_BRIEF = 2

/** 突き合わせの結果。合わなければ添え書きは載せず、理由だけを返す。 */
type QuestionBriefPairing =
  | { readonly kind: "paired"; readonly briefs: readonly QuestionBrief[] }
  | { readonly kind: "mismatched"; readonly reasons: readonly string[] }

/** モデルに見せる `question_brief` ツールの説明。呼ぶ条件は「質問の書き方（tsukumo）」の節が持つ。 */
export const QUESTION_BRIEF_TOOL_DESCRIPTION =
  "AskUserQuestion の直前に呼び、その質問の判断の材料（添え書き）を渡す。利用者の答えは待たずに戻る。" +
  "questions には、次の AskUserQuestion 1回ぶんの質問ごとに1件ずつ、header をその質問と同じ字にして入れる。" +
  "options の label はその質問の選択肢の label と同じ字にし、選択肢を1つ残らず入れる（合わない添え書きは画面に出ない）。" +
  "呼び直すと前の添え書きは置き換わる。"

/** `question_brief` の handler が返す文と、差し戻したか。 */
export type QuestionBriefAnswer = { readonly text: string; readonly isError: boolean }

/** `AskUserQuestion` を積むかの判定。断るときの文はモデルへ返すだけで、ログにもファイルにも書かない。 */
export type QuestionBriefing =
  | { readonly kind: "accepted"; readonly briefs: readonly QuestionBrief[] }
  | { readonly kind: "rejected"; readonly message: string }

/** `question_brief` の呼び出し1つを検査し、通れば `hold` に預けて "ok"、崩れていれば直し方を返す。 */
export function answerQuestionBriefCall(
  briefs: readonly QuestionBrief[],
  hold: (briefs: readonly QuestionBrief[]) => void,
): QuestionBriefAnswer {
  const reasons = reviewQuestionBrief(briefs)
  if (reasons.length > 0) {
    return {
      text: `${reasons.join("。")}。直して呼び直すこと。この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。`,
      isError: true,
    }
  }
  hold(briefs)
  return { text: "ok", isError: false }
}

/**
 * 届いた質問と預かった添え書きから、積むか断るかを決める。
 * 選択肢が2つ以上の質問に合う添え書きが無ければ断る。そうした質問が無ければ必ず積み、合わない添え書きは捨てる。
 * 断る文には質問文・ラベル・添え書きの字を入れず、header と数と、印か recommended のどちらが欠けているかだけを言う。
 */
export function reviewQuestionBriefing(
  questions: readonly Question[],
  held: readonly QuestionBrief[],
): QuestionBriefing {
  const needing = questions.filter(
    (question) =>
      comparableLabels(question.options.map((option) => option.label)).length >=
      MIN_OPTIONS_NEEDING_BRIEF,
  )
  const pairing = pairQuestionBrief(questions, held)
  const problems =
    needing.length === 0
      ? []
      : [
          ...(pairing.kind === "mismatched" ? pairing.reasons : []),
          ...needing
            .filter((question) => !held.some((brief) => brief.header === question.header))
            .map((question) => `「${question.header}」の添え書きが無い`),
        ]
  if (problems.length > 0) {
    return {
      kind: "rejected",
      message: `選択肢が2つ以上の質問には添え書きが要る。${problems.join("。")}。question_brief を呼んでから AskUserQuestion を聞き直すこと。この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。`,
    }
  }
  return { kind: "accepted", briefs: pairing.kind === "paired" ? held : [] }
}

/** 呼んだ時点で分かる崩れの理由の並び。空なら受け付けてよい。 */
function reviewQuestionBrief(briefs: readonly QuestionBrief[]): readonly string[] {
  return [
    ...(briefs.length === 0 || briefs.length > MAX_BRIEF_QUESTIONS
      ? [`questions は1〜${String(MAX_BRIEF_QUESTIONS)}件にする`]
      : []),
    ...duplicateReasons(
      briefs.map((brief) => brief.header),
      "header",
    ),
    ...briefs.flatMap(briefReasons),
  ]
}

/**
 * 添え書きを質問の並びと突き合わせる。
 * 各件の `header` が質問1つにだけ当たり、選択肢の `label` の集合がその質問の選択肢と同じで、
 * 質問の選択肢におすすめの印が付いているかと `recommended` の有る無しが揃っているなら合う。
 * `label` は末尾のおすすめの印を外して比べ、自由入力の選択肢は両側から除く。
 */
function pairQuestionBrief(
  questions: readonly Question[],
  briefs: readonly QuestionBrief[],
): QuestionBriefPairing {
  const reasons = briefs.flatMap((brief) => pairingReasons(questions, brief))
  return reasons.length === 0 ? { kind: "paired", briefs } : { kind: "mismatched", reasons }
}

function briefReasons(brief: QuestionBrief): readonly string[] {
  const at = `「${brief.header}」の`
  return [
    ...(brief.header.trim() === "" ? ["header を空にしない"] : []),
    ...(brief.whyAsk.trim() === "" ? [`${at}whyAsk を空にしない`] : []),
    ...(brief.facts.length < MIN_BRIEF_FACTS || brief.facts.length > MAX_BRIEF_FACTS
      ? [`${at}facts は${String(MIN_BRIEF_FACTS)}〜${String(MAX_BRIEF_FACTS)}件にする`]
      : []),
    ...(brief.facts.some((fact) => fact.text.trim() === "")
      ? [`${at}facts に空の text を入れない`]
      : []),
    ...(brief.recommended?.reason.trim() === "" ? [`${at}recommended の reason を空にしない`] : []),
    ...(brief.options.length < MIN_BRIEF_OPTIONS || brief.options.length > MAX_BRIEF_OPTIONS
      ? [`${at}options は${String(MIN_BRIEF_OPTIONS)}〜${String(MAX_BRIEF_OPTIONS)}件にする`]
      : []),
    ...duplicateReasons(
      brief.options.map((option) => option.label),
      `${at}options の label`,
    ),
    ...brief.options.flatMap((option) => {
      const of = `${at}選択肢「${option.label}」の`
      return [
        ...(option.label.trim() === "" ? [`${at}options の label を空にしない`] : []),
        ...(option.figures.length > MAX_OPTION_FIGURES
          ? [`${of}figures は${String(MAX_OPTION_FIGURES)}つまでにする`]
          : []),
      ]
    }),
  ]
}

/** 理由に質問文・ラベル・添え書きの字は入れず、header と数と、印か recommended のどちらが欠けているかだけを言う。 */
function pairingReasons(questions: readonly Question[], brief: QuestionBrief): readonly string[] {
  const matched = questions.filter((question) => question.header === brief.header)
  const [question] = matched
  if (matched.length !== 1 || question === undefined) {
    return [`添え書きの header「${brief.header}」に当たる質問が1つに決まらない`]
  }
  const at = `「${brief.header}」の添え書き`
  const asked = new Set(comparableLabels(question.options.map((option) => option.label)))
  const briefed = new Set(comparableLabels(brief.options.map((option) => option.label)))
  const missing = [...asked].filter((label) => !briefed.has(label)).length
  const extra = [...briefed].filter((label) => !asked.has(label)).length
  const marked = question.options.some((option) => isRecommendedLabel(option.label))
  return [
    ...(missing === 0 && extra === 0
      ? []
      : [`${at}の選択肢が質問と合わない（足りない${String(missing)}個・余る${String(extra)}個）`]),
    ...(marked && brief.recommended === undefined
      ? [`${at}に recommended が無い（質問の選択肢におすすめの印がある）`]
      : []),
    ...(!marked && brief.recommended !== undefined
      ? [`${at}の recommended を外す（質問の選択肢におすすめの印が無い）`]
      : []),
  ]
}

function duplicateReasons(values: readonly string[], name: string): readonly string[] {
  const duplicated = unique(values.filter((value, index) => values.indexOf(value) !== index))
  return duplicated.map((value) => `${name}「${value}」が重なっている`)
}

function comparableLabels(labels: readonly string[]): readonly string[] {
  return labels
    .map((label) => withoutRecommendedMark(label).trim())
    .filter((label) => label !== FREE_TEXT_OPTION_LABEL)
}
