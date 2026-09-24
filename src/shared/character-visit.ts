// 客として訪ねてくるときにパックが持つもの（`character.json` の `visit` の節。
// `docs/research/character-visit.md` 論点4・論点7）。**`visit` は丸ごと省略できる任意の節**で、
// 持たないパックは客にならない。character.json は利用者が用意する外部由来のファイルなので、
// ここでも構造を信用せず unknown で受けて検証する（docs/coding-standards.md「型を迂回する
// キャストを使わない」）。
//
// `src/shared/character-definition.ts` への差し込みは `CharacterDefinition.visit` の1フィールドと
// `toCharacterVisit` の呼び出しだけにとどめ、`visit` そのものの型・検証はここに閉じる
// （このファイル1つを revert すれば `visit` の読み取りごと戻る）。

import { isPlainObject } from "remeda"

import { type Expression, isExpression } from "./expression.ts"
import { optionalString } from "./utils/optional-string.ts"

/** 台本1行の話し手。あるじ（`host`）が言うか、訪ねてきた客（`guest`）が言うか。 */
export const VISIT_SPEAKERS = ["host", "guest"] as const

export type VisitSpeaker = (typeof VISIT_SPEAKERS)[number]

/** 台本1行（話し手・表情・セリフ）。表情は9つの enum の中でパックが持つものを使う（論点7）。 */
export type VisitScriptLine = {
  readonly speaker: VisitSpeaker
  readonly expression: Expression
  readonly text: string
}

/** 作り損ねたときの落とし先として使う、あらかじめ書かれた掛け合い1本（3〜4行を想定）。 */
export type VisitScript = readonly VisitScriptLine[]

/**
 * 客として訪ねてくるときにパックが持つもの。**`farewell` は必須**（無ければ客になれない）で、
 * `peek` と `scripts` は任意。
 */
export type CharacterVisit = {
  /** 棚の陰から「ひょこっ」と覗く絵のファイル名。無ければ `default` を不透明度で出し入れする。 */
  readonly peek: string | undefined
  /** 帰るときに言う短いセリフ（生成しない定型。論点5）。 */
  readonly farewell: readonly string[]
  /** 台本を作り損ねたときに1本選んで使う、あらかじめ書かれた掛け合い。無ければ来ない。 */
  readonly scripts: readonly VisitScript[]
}

/**
 * `character.json` の `visit` を読む。**オブジェクトでない・`farewell` が無い/空/文字列でない
 * 要素を含むときは `visit` ごと undefined**（客にならない）。`scripts` は配列でなければ空の一覧に
 * 畳み、**形の崩れた台本1本だけを一覧から落とす**（`visit` 自体は生かす。`farewell` と違い
 * 任意の節なので、崩れた1本のために他の台本まで捨てない）。
 */
export function toCharacterVisit(value: unknown): CharacterVisit | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  const farewell = toNonBlankStringArray(value.farewell)
  if (farewell === undefined || farewell.length === 0) {
    return undefined
  }

  return {
    peek: optionalString(value.peek),
    farewell,
    scripts: toVisitScripts(value.scripts),
  }
}

function toNonBlankStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  )
  return strings.length === value.length ? strings : undefined
}

function toVisitScripts(value: unknown): readonly VisitScript[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(toVisitScript).filter((script): script is VisitScript => script !== undefined)
}

function toVisitScript(value: unknown): VisitScript | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }
  const lines = value.map(toVisitScriptLine)
  return lines.every((line): line is VisitScriptLine => line !== undefined) ? lines : undefined
}

function toVisitScriptLine(value: unknown): VisitScriptLine | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  const { speaker, expression, text } = value
  if (!isVisitSpeaker(speaker) || typeof expression !== "string" || !isExpression(expression)) {
    return undefined
  }
  return typeof text === "string" && text.trim() !== "" ? { speaker, expression, text } : undefined
}

function isVisitSpeaker(value: unknown): value is VisitSpeaker {
  return typeof value === "string" && VISIT_SPEAKERS.some((speaker) => speaker === value)
}
