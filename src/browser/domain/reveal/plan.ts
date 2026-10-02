// レポートを「書き上げていくように見せる」演出で、どの塊をいつ出すかを決める（純粋な割り当て。DOM は読むだけで書き換えない）。
//
// DOM は完成品のまま置き、見せる範囲だけを進めるので、ここが返すのは「塊ごとの出し始めと出し終わりの時刻」だけになる。
//
// 塊は「トピック」。`report` の節1つが1トピックで、境目は `reportSectionsMarkdown` が節の間に挟む印で知る。
// 段落や表の1つ1つではない（細かく割ると筆が何度も折り返して落ち着かず、目で追えなくなる）。
//
// 塊1つぶんの時間を決める物差し（`RevealTiming`）は呼び出し側から受け取り、ここは値を持たない。
//
// トピックの中の要素は、見せ方が2種類ある:
//
// - 文字の要素（`text`）: `clip-path` で見せる範囲を進める
// - 図・グラフの要素（`figure`）: 文字の位置が取れない・取っても意味が無いので `opacity` で出す。mermaid と Chart.js は非同期に描いたあとで中身が入れ替わるので、中身ではなく入れ物の class（`mermaid` / `chart-block`）で見分ける（描き終わる前でも後でも同じ判定になる）
//
// 筆を留める時間（`RevealPause`）は塊の書く時間の外に足すので、留めがあっても書く速さは変わらない。

import { sumBy } from "remeda"

import type { RevealTiming } from "../reveal-speed.ts"
import { clamp } from "./paint.ts"

/** 見せる範囲を進められる要素。`clip-path` と `opacity` を持つもの（レポートの塊は全部これ）。 */
export type RevealElement = HTMLElement | SVGElement

export type RevealBlockKind = "text" | "figure"

/** トピックを構成する要素1つ。 */
export type RevealMember = {
  readonly element: RevealElement
  readonly kind: RevealBlockKind
}

/**
 * 書き終えたところで筆を留める1か所。`atMs` は留めを除いた「書く時間の軸」上の位置
 * （`topicDurationMs` が返す持ち時間のうちどこまで進んだら留めるか）で、実際の時間帯は
 * 塊が並ぶにつれて後ろへずれる（{@link RevealBlock.endMs} に足し込まれる）。
 */
export type RevealPause = {
  readonly atMs: number
  readonly durationMs: number
}

/** 塊（トピック）1つと、それを書いている時間帯（演出を始めてからの経過ミリ秒）。 */
export type RevealBlock = {
  readonly members: readonly [RevealMember, ...(readonly RevealMember[])]
  readonly startMs: number
  readonly endMs: number
  readonly pauses: readonly RevealPause[]
}

/**
 * 図・グラフに与える重み（文字数に換算した値）。
 * 図は文字数を持たないので、文字と同じ物差しに載せるために決め打ちの重みを置く。段落1つぶんに相当させる。
 */
const FIGURE_WEIGHT = 100

const FIGURE_SELECTOR = ".mermaid, .mermaid-broken, .chart-block, canvas, svg, img"

/** 結論と検証結果の終わり、節の始まりの印（`SECTIONS_START_MARKDOWN` と同じ class 名）。 */
const SECTIONS_START_SELECTOR = ".report-sections-start"

/**
 * 筆で書く対象の重み（文字数。図は {@link FIGURE_WEIGHT}）の合計がこれに満たないレポートは、演出せずに出す。
 * 速さの設定には左右されない。
 */
export const SHORT_REPORT_WEIGHT = 200

/** 節と節の境目の印（`SECTION_BREAK_MARKDOWN` と同じ class 名）。 */
const SECTION_BREAK_SELECTOR = ".report-section-break"

/**
 * 筆を留める対象の印（`PAUSE_POINT_CLASS_NAME` と同じ class 名。`NOTE_CLASSES` の注意・異常と
 * `OPTION_VERDICTS` の「採る」に付く）。記法の語彙に無い名前なので `NotationBlock` の置き換えを
 * 受けず、レンダー後も素の class 名のまま残る。
 */
const PAUSE_POINT_SELECTOR = ".report-pause-point"

/**
 * 留める長さ（ms）。書く速さの設定（標準 / 速い）に関わらず一定にする
 * （読む速さのつまみではなく、大事な塊を指す強調の間なので、書く速さと連動させない）。
 */
const PAUSE_MS = 400

/** 筆で書く対象が短く、演出せずに出すレポートか。 */
export function isShortReport(root: Element): boolean {
  const weight = sumBy(
    writtenElementsOf(root).filter((element) => !isSectionBreak(element)),
    (element) => memberWeight({ element, kind: blockKind(element) }),
  )
  return weight < SHORT_REPORT_WEIGHT
}

/**
 * 根の直下の要素をトピックへまとめ、書く順（文書の順）に時間を割り当てる。
 * 1つぶんの時間はそのトピックの大きさで決まる（レポート全体の長さに左右されない）。
 *
 * 塊の間に隙間は空けない（前の塊が終わった時刻が次の塊の始まり）。
 */
export function planReveal(root: Element, timing: RevealTiming): readonly RevealBlock[] {
  return toTopics(writtenElementsOf(root)).reduce<{
    blocks: readonly RevealBlock[]
    at: number
  }>(
    (acc, members) => {
      const contentMs = topicDurationMs(members, timing)
      const pauses = pausesOf(members, contentMs)
      const endMs = acc.at + contentMs + sumBy(pauses, (pause) => pause.durationMs)
      return {
        blocks: [...acc.blocks, { members, startMs: acc.at, endMs, pauses }],
        at: endMs,
      }
    },
    { blocks: [], at: 0 },
  ).blocks
}

/**
 * 塊1つの中の進み具合（0〜1）。書き始めと書き終わりをゆっくり、途中を速くする（3次のイーズインアウト。真ん中の速さは等速の3倍）。
 *
 * ミニ立ち絵が「そこで書いている」ように見えるのは筆が遅いところだけなので、出だしと締めで見せて、読み手が待つだけの真ん中を速く抜ける。
 * 塊の持ち時間は変えないので、レポート全体の長さは変わらない。
 *
 * 留め（{@link RevealPause}）がある塊では、留めている間は書く時間の軸が進まないので、進み具合もその位置で足踏みする。
 */
export function blockProgress(block: RevealBlock, elapsedMs: number): number {
  const pauseMs = sumBy(block.pauses, (pause) => pause.durationMs)
  const contentSpan = block.endMs - block.startMs - pauseMs
  if (contentSpan <= 0) {
    return 1
  }

  const sinceStart = clamp(elapsedMs - block.startMs, 0, block.endMs - block.startMs)
  const linear = clamp(writeElapsedOf(block.pauses, sinceStart) / contentSpan, 0, 1)
  return linear < 0.5 ? 4 * linear ** 3 : 1 - (2 - 2 * linear) ** 3 / 2
}

/** 筆で書く要素。節の始まりの印があれば、その後ろだけ（結論と検証結果は最初から出す）。 */
function writtenElementsOf(root: Element): readonly RevealElement[] {
  const elements = [...root.children].filter(isRevealElement)
  const start = elements.findIndex((element) => element.matches(SECTIONS_START_SELECTOR))
  return start === -1 ? elements : elements.slice(start + 1)
}

/** 節の境目の印で切って、続く要素をひとまとめにする。印そのものはトピックに入れない。 */
function toTopics(
  elements: readonly RevealElement[],
): readonly (readonly [RevealMember, ...(readonly RevealMember[])])[] {
  return elements.reduce<{
    readonly topics: readonly (readonly [RevealMember, ...(readonly RevealMember[])])[]
    readonly atBreak: boolean
  }>(
    (acc, element) => {
      if (isSectionBreak(element)) {
        return { topics: acc.topics, atBreak: true }
      }
      const member: RevealMember = { element, kind: blockKind(element) }
      const last = acc.topics.at(-1)
      return last === undefined || acc.atBreak
        ? { topics: [...acc.topics, [member]], atBreak: false }
        : {
            topics: [...acc.topics.slice(0, -1), [last[0], ...last.slice(1), member]],
            atBreak: false,
          }
    },
    { topics: [], atBreak: false },
  ).topics
}

function isSectionBreak(element: RevealElement): boolean {
  return element.matches(SECTION_BREAK_SELECTOR)
}

function topicDurationMs(members: readonly RevealMember[], timing: RevealTiming): number {
  const weight = sumBy(members, memberWeight)
  return Math.min(Math.max(weight * timing.msPerCharacter, timing.minBlockMs), timing.maxBlockMs)
}

/**
 * トピックの中で筆を留める位置を、メンバーの文字数の重み（{@link memberWeight}）に比例して決める。
 * DOM の実測（行の位置）を使わないのは、Z字の帯がトピックにつき2本しか無く、帯の途中の位置を
 * 測っても対象がどちらの帯にあるかしか分からないため。文字数の比例なら対象がトピックの中のどこに
 * あっても一様に決まり、DOM の測り直しも要らない。
 */
function pausesOf(
  members: readonly RevealMember[],
  contentDurationMs: number,
): readonly RevealPause[] {
  const totalWeight = sumBy(members, memberWeight)
  if (totalWeight <= 0) {
    return []
  }

  return members.reduce<{ readonly pauses: readonly RevealPause[]; readonly weightBefore: number }>(
    (acc, member) => {
      const weight = memberWeight(member)
      const pauses = pauseTargetsOfMember(member).map((target) => ({
        atMs:
          ((acc.weightBefore + targetOffsetWithin(member, target) * weight) / totalWeight) *
          contentDurationMs,
        durationMs: PAUSE_MS,
      }))
      return { pauses: [...acc.pauses, ...pauses], weightBefore: acc.weightBefore + weight }
    },
    { pauses: [], weightBefore: 0 },
  ).pauses
}

/** メンバーの中で筆を留める対象。メンバー自身が対象なら1つ（`note` の注意・異常）、そうでなければ中の子（`options` の「採る」カード）を文書の順で拾う。 */
function pauseTargetsOfMember(member: RevealMember): readonly RevealElement[] {
  if (member.element.matches(PAUSE_POINT_SELECTOR)) {
    return [member.element]
  }
  return [...member.element.querySelectorAll(PAUSE_POINT_SELECTOR)].filter(isRevealElement)
}

/**
 * 対象がメンバーの重みのうちどこまで進んだ位置にあるか（0〜1）。
 * 対象がメンバー自身なら末尾（1）。そうでなければ直下の子を文字数で数え、対象を含むところまでの累計を割合にする
 * （`options` の子はカード1枚ずつなので、直下の子だけを見れば足りる）。
 */
function targetOffsetWithin(member: RevealMember, target: RevealElement): number {
  if (target === member.element) {
    return 1
  }

  const children = [...member.element.children].filter(isRevealElement)
  const index = children.findIndex((child) => child === target || child.contains(target))
  const totalChars = sumBy(children, textLength)
  if (index === -1 || totalChars <= 0) {
    return 1
  }
  return clamp(sumBy(children.slice(0, index + 1), textLength) / totalChars, 0, 1)
}

/** 留め（{@link RevealPause}）を差し引いた「書く時間の軸」上の経過（ms）。留めている間はその位置で足踏みする。 */
function writeElapsedOf(pauses: readonly RevealPause[], sinceStart: number): number {
  return pauses.reduce((remaining, pause) => {
    if (remaining < pause.atMs) {
      return remaining
    }
    return remaining < pause.atMs + pause.durationMs ? pause.atMs : remaining - pause.durationMs
  }, sinceStart)
}

function memberWeight(member: RevealMember): number {
  // 空の段落で時間が 0 にならないよう、文字の要素の重みは最低 1。
  return member.kind === "figure" ? FIGURE_WEIGHT : Math.max(1, textLength(member.element))
}

/**
 * `clip-path` で進めるか、`opacity` で出すか。入れ物の class で見分ける。
 * mermaid は描き終わると `<svg>` に中身が入れ替わり、そこに文字（ラベル）が現れるので、文字の有無だけでは足りない。
 * 文字を1つも持たない要素（画像だけの段落など）も `opacity` で出す。
 */
function blockKind(element: RevealElement): RevealBlockKind {
  if (element.matches(FIGURE_SELECTOR) || element.querySelector(FIGURE_SELECTOR) !== null) {
    return "figure"
  }
  return textLength(element) === 0 ? "figure" : "text"
}

function textLength(element: RevealElement): number {
  return (element.textContent ?? "").trim().length
}

function isRevealElement(node: Element): node is RevealElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}
