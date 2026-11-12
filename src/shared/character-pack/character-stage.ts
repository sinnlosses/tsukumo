// 舞台に立つ立ち絵の置き方（`character.json` の `stage`）の読み取り。
// 定義ファイルは外部由来なので、欄ごとに読めない値は既定へ、範囲外の数は帯の端へ寄せ、外へは欄の揃った `CharacterStage` だけを出す。
// 欄の無いパックは DEFAULT_CHARACTER_STAGE で立つ。

import { clamp } from "remeda"

/** ぼかして隠す素材の縁の向き。 */
const STAGE_FADE_EDGES = ["top", "right", "bottom", "left"] as const

export type StageFadeEdge = (typeof STAGE_FADE_EDGES)[number]

/**
 * 立ち絵の置き方。割合はどれも 0〜1 を 0%〜100% とみなす。
 * 立ち絵はいつも舞台の下端に接し、高さは幅と素材の縦横比から決まる。
 */
export type CharacterStage = {
  /** 立ち絵の左端の位置。舞台の幅に対する割合で、負なら左へはみ出す。 */
  readonly left: number
  /** 立ち絵の幅。舞台の幅に対する割合。 */
  readonly width: number
  /** ぼかして隠す縁。素材の四角い縁が舞台の中に見える向きを並べる。空なら縁をぼかさない。 */
  readonly fade: readonly StageFadeEdge[]
  /** 素材の上端から頭のてっぺんまで。素材の高さに対する割合で、吹き出しの付け根はここに来る。 */
  readonly head: number
}

export const DEFAULT_CHARACTER_STAGE = {
  left: -0.06,
  width: 1.18,
  fade: ["top", "right"],
  head: 0.07,
} as const satisfies CharacterStage

/**
 * `character.json` の `stage` を読む。
 * オブジェクトでなければ全体を既定に、欄ごとに読めない値はその欄だけを既定に落とす。
 */
export function toCharacterStage(value: unknown): CharacterStage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_CHARACTER_STAGE
  }

  // oxlint-disable-next-line typescript/consistent-type-assertions -- 配列でない object と確かめた値を、キーで引くために Record として読む（外の JSON を読む1か所）
  const record = value as Record<string, unknown>
  return {
    left: ratioWithin(record["left"], LEFT_RANGE, DEFAULT_CHARACTER_STAGE.left),
    width: ratioWithin(record["width"], WIDTH_RANGE, DEFAULT_CHARACTER_STAGE.width),
    fade: toFadeEdges(record["fade"]),
    head: ratioWithin(record["head"], HEAD_RANGE, DEFAULT_CHARACTER_STAGE.head),
  }
}

type Range = { readonly min: number; readonly max: number }

const LEFT_RANGE = { min: -0.5, max: 0.5 } as const satisfies Range

const WIDTH_RANGE = { min: 0.5, max: 2 } as const satisfies Range

const HEAD_RANGE = { min: 0, max: 0.6 } as const satisfies Range

function ratioWithin(value: unknown, range: Range, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }
  return clamp(value, range)
}

/** 配列でなければ既定。知らない向きは捨て、重なりは1つに畳み、{@link STAGE_FADE_EDGES} の順に並べる。 */
function toFadeEdges(value: unknown): readonly StageFadeEdge[] {
  if (!Array.isArray(value)) {
    return DEFAULT_CHARACTER_STAGE.fade
  }
  return STAGE_FADE_EDGES.filter((edge) => value.includes(edge))
}
