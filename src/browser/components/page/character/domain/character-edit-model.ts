// `<CharacterEdit>` が画面に出す形。フックが畳み、presenter と部品が `kind` で出し分けて置く。

import type { Expression, Outfit } from "../../../../../shared/character-pack/expression.ts"
import type { AccentSwatchModel } from "./accent-swatch-model.ts"

/** 名乗り（大きな顔・名前・id・使用中の札・ひとこと）と、その右の口。 */
export type CharacterProfileModel = {
  readonly name: string
  /** パックの名前（ディレクトリ名）。`id: <名前>` として等幅で出す。 */
  readonly id: string
  readonly face: { readonly kind: "absent" } | { readonly kind: "shown"; readonly url: string }
  readonly inUse: boolean
  readonly tagline: { readonly kind: "absent" } | { readonly kind: "shown"; readonly text: string }
  /** 変えられないパックのときの理由の一言。 */
  readonly note: { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }
  /** 使用中以外のパックにだけ出す「このキャラクターに切り替える」。 */
  readonly switchTo:
    | { readonly kind: "hidden" }
    | {
        readonly kind: "shown"
        readonly disabled: boolean
        /** 押せない理由（`title`。React の `title` がそのまま undefined を受けるので畳まない）。 */
        readonly title: string | undefined
        readonly onSwitch: () => void
      }
  /** 「名前とプロフィールを変える」（鉛筆のボタン）。変えられないパックでは出さない。 */
  readonly editProfile: CharacterProfileEditModel
}

/**
 * 名前とひとことプロフィールを変えるダイアログの下書きの種。
 * 空文字も渡す。空なら書き込む側（`characterPack.setProfile`）が畳む（名前は id へ、ひとことは「無い」へ）。
 */
export type CharacterProfileEditModel =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      readonly name: string
      readonly tagline: string
      readonly onSubmit: (name: string, tagline: string) => void
    }

/**
 * 表情のカード1枚。
 * 自分の絵を持たない表情は `blank`（その表情の名前を書いた点線の枠。9つそろえば出ない）。
 */
export type PortraitCardModel = {
  readonly expression: Expression
  readonly label: string
  /** `default` にだけ添える札（「いつもの顔」）。 */
  readonly badge: { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }
  readonly image:
    | { readonly kind: "blank" }
    | {
        readonly kind: "shown"
        readonly url: string
        readonly accent: string
        readonly outfit: Outfit
      }
  /** 選ぶ口の読み上げ（どの表情のことか。口はアイコンか空欄の枠なので見える字には入れない）。 */
  readonly pickAriaLabel: string
  readonly onPick: (input: HTMLInputElement) => void
  /** カードに画像を落としたとき。 */
  readonly onDropFile: (file: File) => void
  /** 消す口（`default` と、自分の絵が無い表情には出さない）。 */
  readonly clear:
    | { readonly kind: "hidden" }
    | {
        readonly kind: "shown"
        readonly ariaLabel: string
        /** 消したあとに代わりに出る表情（`default`）のラベル。消す前の確かめの本文に使う。 */
        readonly fallbackLabel: string
        readonly onClear: () => void
      }
}

/** 衣装ごとの差し色の欄1つ。 */
export type OutfitAccentFieldModel = AccentSwatchModel & { readonly outfit: Outfit }

/**
 * 雑談の差し色を「仕事と同じ」へ戻す口。
 * `chatAccent` を持たないパック（雑談も仕事と同じ差し色のまま）では、戻すものが無いので出さない。
 */
export type ChatAccentResetModel =
  | { readonly kind: "hidden" }
  | { readonly kind: "shown"; readonly onClick: () => void }

/**
 * 画像1枚の行（顔・背景）。字（`label`）は有無どちらでも出す。
 * `kind` は縮図と空の枠の見た目を選び、`subject` は読み上げの名前の頭になる。
 */
export type ImageFieldModel = {
  readonly kind: "face" | "background"
  readonly subject: string
  readonly accept: string
  readonly image: { readonly kind: "absent" } | { readonly kind: "present"; readonly url: string }
  readonly label: string
  readonly rejection: ImageRejectionNoteModel
  readonly onPick: (input: HTMLInputElement) => void
  readonly onClear: () => void
}

/** 直前に選んだ画像の書き込みを断られたときの一言。次に選び直すと消える。 */
export type ImageRejectionNoteModel =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

/**
 * 詳しい設定の最下部、キャラクターを消す／同梱に戻す帯とその確かめ。
 * 消せないパック（`removal: "none"`）では出さない。文言・押せるかはここで畳み済み。
 */
export type CharacterDeleteBandModel =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      /** 確かめの入力と突き合わせる id（＝パックの名前）。 */
      readonly pack: string
      readonly heading: string
      readonly note: string
      /** 帯のボタンの字（「<名前> を消す」／「<名前> を同梱に戻す」）。 */
      readonly buttonLabel: string
      /** ダイアログの見出し（「<名前> を消しますか？」など）。 */
      readonly dialogHeading: string
      readonly dialogNote: string
      /** ダイアログの実行ボタンの字（帯の動詞と同じ）。 */
      readonly okLabel: string
      readonly face: { readonly kind: "absent" } | { readonly kind: "shown"; readonly url: string }
      /** 使用中は押せない（切り替えてから消す）。 */
      readonly disabled: boolean
      readonly title: string | undefined
      readonly onSubmit: () => void
    }

/** `<CharacterEdit>` が画面に出す形。presenter は `kind` で出し分けて置くだけ。 */
export type CharacterEditModel =
  | {
      /** まだ `character-changed` が届いていない（接続直後の一瞬）。口を出すものが決まらない。 */
      readonly kind: "waiting"
    }
  | {
      readonly kind: "ready"
      readonly profile: CharacterProfileModel
      /** 画面から変えられないパック。口をすべて塞ぐ（理由は `profile.note`）。 */
      readonly disabled: boolean
      readonly cards: readonly PortraitCardModel[]
      /** 表情の格子の上に出す。カードの中は狭いので、どの表情かは文面で言う。 */
      readonly portraitRejection: ImageRejectionNoteModel
      /** 画面の差し色（仕事）。`accent` を差す。 */
      readonly workAccent: AccentSwatchModel
      /** 画面の差し色（雑談）。`chatAccent` を持たなければ、仕事の差し色をそのまま見本に出す。 */
      readonly chatAccent: AccentSwatchModel
      readonly resetChatAccent: ChatAccentResetModel
      readonly outfitAccents: readonly OutfitAccentFieldModel[]
      readonly face: ImageFieldModel
      readonly background: ImageFieldModel
      readonly deleteBand: CharacterDeleteBandModel
    }
