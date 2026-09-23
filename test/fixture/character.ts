// テストが使う、手で書いた架空のキャラクター1体分の組み立て（docs/coding-standards.md
// 「消すかどうか」の「同じモックの準備が複数ファイルに重複している → 準備を共通の
// フィクスチャに寄せる」）。**表情・衣装は全キーが必須の対応表**（`?:` を使わない規約のため）
// なので、テストが手で書き下すと `EXPRESSIONS` に1つ足すたび各ファイルに1行ずつ増える。
// ここに既定を1つ置き、テストは**違うところだけ**を渡す。
//
// **既定は「立ち絵も差し色も1枚も無い」**（`toCharacterInfo` が定義の無いパックに返す形と同じ）。
// 立ち絵の有無はテストの主題になりうる（どの枠が埋まっているか・何枚出るか）ので、
// **「ある」ほうを呼ぶ側に書かせる**。
//
// **入れ子は深い合成をしない。** `portraits` / `outfitAccents` を同じ形の組み立て関数として
// 別に出し、呼ぶ側が `portraits: portraits({ default: "…" })` と重ねる。どのキーを埋めたのかが
// 呼ぶ側の1行に出るのと、定義ファイルの形だけが要る場面（`expressionChoices` のテスト）でも
// そのまま使えるのが理由。
//
// **画面に渡る姿（`CharacterInfo`）の表は `default` に畳み済み**なので、定義ファイル側の
// `portraits` / `outfitAccents` とは別に {@link shownPortraits} / {@link shownOutfitAccents} を置く
// （`toCharacterInfo` と同じ畳み方で、呼ぶ側は「ある」ものだけを書く）。
//
// `character-changed` イベントは `{ kind } & CharacterInfo & { packs }`（src/shared/session-event.ts）
// なので、{@link characterChangedEvent} は `characterInfo` に `kind` / `packs` を足して広げるだけ。

import { type CharacterDefinition } from "../../src/shared/character-definition.ts"
import { type CharacterInfo, type CharacterPackChoice } from "../../src/shared/character.ts"
import { type Expression, EXPRESSIONS, type Outfit } from "../../src/shared/expression.ts"
import { type SessionEvent } from "../../src/shared/session-event.ts"

/** 画面に渡る姿（`SessionState.character` と `character-changed` の中身）。 */
export function characterInfo(overrides: Partial<CharacterInfo> = {}): CharacterInfo {
  return {
    pack: "fictional",
    name: "架空の精霊",
    accent: undefined,
    chatAccent: undefined,
    expressions: [{ name: "default", label: "通常" }],
    portraits: undefined,
    expressionsWithPortrait: [],
    mini: undefined,
    face: undefined,
    outfitAccents: shownOutfitAccents(),
    background: undefined,
    editable: true,
    ...overrides,
  }
}

/**
 * キャラクターパックが決まった（`character-changed`）イベント。**`packs` の既定は
 * `characterInfo()` の既定と同じ1枠**（`{ name: "fictional", label: "架空の精霊" }`）。
 * 切り替え先が複数あるテストは呼ぶ側で渡す。
 */
export function characterChangedEvent(
  overrides: Partial<CharacterInfo> = {},
  packs: readonly CharacterPackChoice[] = [{ name: "fictional", label: "架空の精霊" }],
): Extract<SessionEvent, { readonly kind: "character-changed" }> {
  return { kind: "character-changed", ...characterInfo(overrides), packs }
}

/** 定義ファイル（character.json）を読んだ形。値はファイル名で、URL ではない。 */
export function characterDefinition(
  overrides: Partial<CharacterDefinition> = {},
): CharacterDefinition {
  return {
    name: "架空の精霊",
    accent: undefined,
    chatAccent: undefined,
    // 表情のラベル（定義ファイル側の言葉）。立ち絵と同じ形の対応表なので同じ既定を使う。
    expressions: NO_EXPRESSION_VALUES,
    portraits: portraits(),
    mini: undefined,
    face: undefined,
    outfitAccents: outfitAccents(),
    background: undefined,
    ...overrides,
  }
}

/** 表情 → 立ち絵（`CharacterInfo` では URL、`CharacterDefinition` ではファイル名）。 */
export function portraits(
  overrides: Partial<Record<Expression, string>> = {},
): Readonly<Record<Expression, string | undefined>> {
  return { ...NO_EXPRESSION_VALUES, ...overrides }
}

/** 衣装 → 差し色。 */
export function outfitAccents(
  overrides: Partial<Record<Outfit, string>> = {},
): Readonly<Record<Outfit, string | undefined>> {
  return { ...NO_OUTFIT_ACCENTS, ...overrides }
}

/**
 * 画面に渡る立ち絵（URL）。**渡した表情だけが自分の絵を持ち、残りは `default` の絵に畳む**
 * （`toCharacterInfo` と同じ）。`characterInfo({ ...shownPortraits({ default: "…" }) })` と広げて使う。
 */
export function shownPortraits(
  urls: { readonly default: string } & Partial<Record<Expression, string>>,
): Pick<CharacterInfo, "portraits" | "expressionsWithPortrait"> {
  const own = portraits(urls)
  return {
    portraits: {
      default: urls.default,
      thinking: own.thinking ?? urls.default,
      proud: own.proud ?? urls.default,
      flustered: own.flustered ?? urls.default,
      serious: own.serious ?? urls.default,
      curious: own.curious ?? urls.default,
      sad: own.sad ?? urls.default,
      excited: own.excited ?? urls.default,
      bored: own.bored ?? urls.default,
    },
    expressionsWithPortrait: EXPRESSIONS.filter((expression) => own[expression] !== undefined),
  }
}

/** 画面に渡る差し色。**渡さなかった衣装は `default` に畳む**（`toCharacterInfo` と同じ）。 */
export function shownOutfitAccents(
  overrides: Partial<Record<Outfit, string>> = {},
): Readonly<Record<Outfit, string | undefined>> {
  const fallback = overrides.default
  return {
    default: fallback,
    light: overrides.light ?? fallback,
    normal: overrides.normal ?? fallback,
    heavy: overrides.heavy ?? fallback,
  }
}

/** 表情ごとの対応表の「1つも無い」。立ち絵（URL・ファイル名）とラベルの両方に使う。 */
const NO_EXPRESSION_VALUES = {
  default: undefined,
  thinking: undefined,
  proud: undefined,
  flustered: undefined,
  serious: undefined,
  curious: undefined,
  sad: undefined,
  excited: undefined,
  bored: undefined,
} satisfies Readonly<Record<Expression, string | undefined>>

const NO_OUTFIT_ACCENTS = {
  default: undefined,
  light: undefined,
  normal: undefined,
  heavy: undefined,
} satisfies Readonly<Record<Outfit, string | undefined>>
