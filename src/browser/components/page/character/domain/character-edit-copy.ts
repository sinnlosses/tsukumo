// `<CharacterEdit>` の文言と、顔・背景に選べる種類の表。

import type { CharacterPackRemoval } from "../../../../../shared/character-pack/character.ts"
import type { Outfit } from "../../../../../shared/character-pack/expression.ts"
import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import type { AccentSwatchModel } from "./accent-swatch-model.ts"

/** 背景の行の、いまの状態を表す字（印だけにしない）。 */
export const BACKGROUND_LABEL = { present: "いまの背景", absent: "背景なし" } as const

/** 顔の行の、いまの状態を表す字（印だけにしない）。 */
export const FACE_LABEL = { present: "いまの顔", absent: "顔なし" } as const

/** 顔に選べる種類。中身の検証はサーバ側で、ここは選ぶときの絞り込みだけ。 */
export const FACE_FILE_ACCEPT = ".svg,.png,.gif"

/** 背景に選べる種類。`.gif` は入れない（動く背景は読む面の隣で気が散る）。 */
export const BACKGROUND_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp"

/**
 * 衣装のラベル。モデルの重さ（装備の重さ）の言い方はどのキャラクターでも同じなので画面側が持つ。
 * 見える字は装備の名前とモデルの2段に分け、読み上げには1つにつないで渡す。
 */
export const OUTFIT_LABELS = {
  default: { label: "既定", sublabel: { kind: "none" } },
  light: { label: "軽装", sublabel: { kind: "shown", text: "haiku" } },
  normal: { label: "通常装備", sublabel: { kind: "shown", text: "sonnet" } },
  heavy: { label: "戦闘配置", sublabel: { kind: "shown", text: "opus" } },
} as const satisfies Readonly<Record<Outfit, Pick<AccentSwatchModel, "label" | "sublabel">>>

/** カードの立ち絵に当てる衣装。並びでは衣装の違いを出さない（差し色の行がその役目）。 */
export const GALLERY_OUTFIT: Outfit = "default"

/** 必須の1つ（`default`）のカードに添える札。どの表情が「いつもの顔」かを字で出す。 */
export const DEFAULT_EXPRESSION_BADGE = "いつもの顔"

/** 画面から変えられないパックのときに出す一言。 */
export const NOT_EDITABLE_NOTE = "起動先の characters/local のパックは、画面からは変えられない"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。
// 理由の文面はサーバが断るときと同じ定型文を使う。
export const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/**
 * 帯とダイアログの文言を `removal` の2値（`"none"` は帯を出さないので含まない）で出し分ける。
 * 同梱を直したパックは「消す」ではなく「同梱に戻す」と見せる。
 * 活用は動的に作らず全部書き下す。
 * `verb`（辞書形。帯とダイアログの実行ボタン）・`dialogQuestion`（丁寧形の問い）・`blockedTitle`（可能形。使用中で押せないときの理由）は同じ動詞でも形が違うため。
 */
export const DELETE_COPY = {
  delete: {
    heading: "このキャラクターを消す",
    note: "表情・差し色・背景もいっしょに消えます。使用中のキャラクターは、先に別のキャラクターに切り替えてから消せます。",
    verb: "消す",
    dialogQuestion: "消しますか？",
    dialogNote: (portraitCount: number): string =>
      `表情 ${String(portraitCount)} 枚・差し色・背景もいっしょに消えます。\n消したあとは元に戻せません。`,
    blockedTitle: "使用中のキャラクターは、先に別のキャラクターに切り替えてから消せます",
  },
  "revert-to-bundled": {
    heading: "同梱に戻す",
    note: "画面で直した見た目と、覚えたことが消え、同梱の元の姿に戻ります。使用中のキャラクターは、先に別のキャラクターに切り替えてから戻せます。",
    verb: "同梱に戻す",
    dialogQuestion: "同梱に戻しますか？",
    dialogNote: (): string =>
      "画面で直した見た目と、覚えたことが消えます。\n雑談の記録は残ります。",
    blockedTitle: "使用中のキャラクターは、先に別のキャラクターに切り替えてから戻せます",
  },
} as const satisfies Record<
  Exclude<CharacterPackRemoval, "none">,
  {
    readonly heading: string
    readonly note: string
    readonly verb: string
    readonly dialogQuestion: string
    readonly dialogNote: (portraitCount: number) => string
    readonly blockedTitle: string
  }
>
