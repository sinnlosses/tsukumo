// `<CharacterEdit>` のロジック。
// 一覧で選んでいるパック（使用中とは限らない）の姿を、名乗り・表情のカード・差し色・背景・顔へ畳み、選んだ画像を data URL にして送る呼び先と一緒に返す。
//
// `characterPack.*` の手続きはどれも書き込む先のパックの名前（`pack`）を持ち、選んでいるパックの名前を入れる。
// 使用中以外を直しても使用中の姿は変わらない。
// ここは選んだ画像を data URL にして渡すだけで、素材をブラウザ側に持ち続けない。
//
// `default` には消す口を出さない（立ち絵が必ず要る1つ。`REQUIRED_EXPRESSIONS`）。
//
// 16進の色をここに書かない。定義に無い衣装の初期値は `--accent` から読む（`readAccentColor`）。
// `--accent` はキャラクターを切り替えたとき（起こし直しで作り直る）しか変わらないので、マウント時に1回だけ読んで `accentFallback` に持つ。
//
// 差し色の引きずり中の上書きと送信のまとめは `useHeldAccent`（衣装ごと・画面の差し色の2系統で1回ずつ呼ぶ）。

import { useState } from "react"

import type { AccentTarget } from "../../../../../../shared/character-pack/character-definition.ts"
import type {
  CharacterInfo,
  CharacterPackRemoval,
} from "../../../../../../shared/character-pack/character.ts"
import { resolveExpressionLabel } from "../../../../../../shared/character-pack/expression-choice.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type Outfit,
  type RemovableExpression,
  OUTFITS,
} from "../../../../../../shared/character-pack/expression.ts"
import { FRAME_ERROR_REASON } from "../../../../../../shared/frame.ts"
import { readAccentColor } from "../../../../../domain/appearance-color.ts"
import { type SessionDispatch, useSession, useTurnRunning } from "../../../../../stores/session.ts"
import { readDataUrl } from "../../../../../utils/data-url.ts"
import type { AccentSwatchModel } from "../accent-swatch/accent-swatch.tsx"
import { useHeldAccent } from "./use-held-accent.ts"
import { useSelectedPack } from "./use-selected-pack.ts"

/** 背景の行の、いまの状態を表す字（印だけにしない）。 */
const BACKGROUND_LABEL = { present: "いまの背景", absent: "背景なし" } as const

/** 顔の行の、いまの状態を表す字（印だけにしない）。 */
const FACE_LABEL = { present: "いまの顔", absent: "顔なし" } as const

/** 顔に選べる種類。中身の検証はサーバ側で、ここは選ぶときの絞り込みだけ。 */
const FACE_FILE_ACCEPT = ".svg,.png,.gif"

/** 背景に選べる種類。`.gif` は入れない（動く背景は読む面の隣で気が散る）。 */
const BACKGROUND_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp"

/**
 * 衣装のラベル。モデルの重さ（装備の重さ）の言い方はどのキャラクターでも同じなので画面側が持つ。
 * 見える字は装備の名前とモデルの2段に分け、読み上げには1つにつないで渡す。
 */
const OUTFIT_LABELS = {
  default: { label: "既定", sublabel: { kind: "none" } },
  light: { label: "軽装", sublabel: { kind: "shown", text: "haiku" } },
  normal: { label: "通常装備", sublabel: { kind: "shown", text: "sonnet" } },
  heavy: { label: "戦闘配置", sublabel: { kind: "shown", text: "opus" } },
} as const satisfies Readonly<Record<Outfit, Pick<AccentSwatchModel, "label" | "sublabel">>>

/** カードの立ち絵に当てる衣装。並びでは衣装の違いを出さない（差し色の行がその役目）。 */
const GALLERY_OUTFIT: Outfit = "default"

/** 必須の1つ（`default`）のカードに添える札。どの表情が「いつもの顔」かを字で出す。 */
const DEFAULT_EXPRESSION_BADGE = "いつもの顔"

/** 画面から変えられないパックのときに出す一言。 */
const NOT_EDITABLE_NOTE = "起動先の characters/local のパックは、画面からは変えられない"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。
// 理由の文面はサーバが断るときと同じ定型文を使う。
const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/**
 * 帯とダイアログの文言を `removal` の2値（`"none"` は帯を出さないので含まない）で出し分ける。
 * 同梱を直したパックは「消す」ではなく「同梱に戻す」と見せる。
 * 活用は動的に作らず全部書き下す。
 * `verb`（辞書形。帯とダイアログの実行ボタン）・`dialogQuestion`（丁寧形の問い）・`blockedTitle`（可能形。使用中で押せないときの理由）は同じ動詞でも形が違うため。
 */
const DELETE_COPY = {
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
  readonly onPick: (input: HTMLInputElement) => void
  readonly onClear: () => void
}

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

export function useCharacterEdit(): CharacterEditModel {
  const dispatch = useSession((session) => session.dispatch)
  const selected = useSelectedPack()
  const turnInProgress = useTurnRunning()
  const outfitAccent = useHeldAccent<Outfit>(({ pack, target, color }) => {
    dispatch.characterPack.setOutfitAccent({ pack, outfit: target, color })
  })
  const screenAccent = useHeldAccent<AccentTarget>(({ pack, target, color }) => {
    dispatch.characterPack.setAccent({ pack, target, color })
  })
  // 差し色が定義に無い衣装・パックの初期値（`--accent`）。読みは描画の外（マウント時の1回）に置く。
  const [accentFallback] = useState(readAccentColor)

  if (selected.kind === "waiting") {
    return { kind: "waiting" }
  }

  const character = selected.character
  const pack = character.pack
  const heldOutfit = outfitAccent.heldOf(pack)
  const heldScreen = screenAccent.heldOf(pack)
  const accentOf = (outfit: Outfit): string =>
    heldOutfit[outfit] ?? character.outfitAccents[outfit] ?? accentFallback

  const disabled = !character.editable
  const cards = portraitCards(character, accentOf(GALLERY_OUTFIT), {
    pick: (expression, image) => {
      dispatch.characterPack.setPortrait({ pack, expression, image })
    },
    clear: (expression) => {
      dispatch.characterPack.clearPortrait({ pack, expression })
    },
  })

  const outfitAccents = OUTFITS.map((outfit): OutfitAccentFieldModel => {
    const { label, sublabel } = OUTFIT_LABELS[outfit]
    return {
      outfit,
      inputId: `character-outfit-accent-${outfit}`,
      label,
      sublabel,
      ariaLabel: sublabel.kind === "shown" ? `${label}（${sublabel.text}）` : label,
      value: accentOf(outfit),
      onChange: (color) => {
        outfitAccent.hold(pack, outfit, { kind: "set", color })
      },
    }
  })

  // 仕事の差し色（`accent`）。無ければ `--accent`（既定値）に落ちる。
  const workAccentValue = heldScreen.work ?? character.accent ?? accentFallback
  const workAccent: AccentSwatchModel = {
    inputId: "character-screen-accent-work",
    label: "仕事",
    sublabel: { kind: "none" },
    ariaLabel: "仕事",
    value: workAccentValue,
    onChange: (color) => {
      screenAccent.hold(pack, "work", { kind: "set", color })
    },
  }

  // 雑談の差し色（`chatAccent`）。持たないパックでは仕事の差し色をそのまま見本に出す。
  // 「仕事と同じ」であることが色そのもので伝わり、ドラッグ中の仕事の値も追いかける。
  const hasChatAccent = heldScreen.chat !== undefined || character.chatAccent !== undefined
  const chatAccent: AccentSwatchModel = {
    inputId: "character-screen-accent-chat",
    label: "雑談",
    sublabel: { kind: "none" },
    ariaLabel: "雑談",
    value: heldScreen.chat ?? character.chatAccent ?? workAccentValue,
    onChange: (color) => {
      screenAccent.hold(pack, "chat", { kind: "set", color })
    },
  }
  const resetChatAccent: ChatAccentResetModel = hasChatAccent
    ? {
        kind: "shown",
        onClick: () => {
          screenAccent.hold(pack, "chat", { kind: "reset" })
          dispatch.characterPack.clearChatAccent({ pack })
        },
      }
    : { kind: "hidden" }

  const face: ImageFieldModel = {
    kind: "face",
    subject: "顔",
    accept: FACE_FILE_ACCEPT,
    image:
      character.face === undefined ? { kind: "absent" } : { kind: "present", url: character.face },
    label: character.face === undefined ? FACE_LABEL.absent : FACE_LABEL.present,
    onPick: (input) => {
      void readPicked(input, (image) => {
        dispatch.characterPack.setFace({ pack, image })
      })
    },
    onClear: () => {
      dispatch.characterPack.clearFace({ pack })
    },
  }

  const background: ImageFieldModel = {
    kind: "background",
    subject: "背景",
    accept: BACKGROUND_FILE_ACCEPT,
    image:
      character.background === undefined
        ? { kind: "absent" }
        : { kind: "present", url: character.background.image },
    label: character.background === undefined ? BACKGROUND_LABEL.absent : BACKGROUND_LABEL.present,
    onPick: (input) => {
      void readPicked(input, (image) => {
        dispatch.characterPack.setBackground({ pack, image })
      })
    },
    onClear: () => {
      dispatch.characterPack.clearBackground({ pack })
    },
  }

  const deleteBand: CharacterDeleteBandModel =
    selected.removal === "none"
      ? { kind: "hidden" }
      : deleteBandOf(selected.removal, character, selected.inUse, dispatch)

  const profile: CharacterProfileModel = {
    name: character.name ?? pack,
    id: pack,
    face:
      character.face === undefined ? { kind: "absent" } : { kind: "shown", url: character.face },
    inUse: selected.inUse,
    tagline:
      character.tagline === undefined || character.tagline === ""
        ? { kind: "absent" }
        : { kind: "shown", text: character.tagline },
    note: disabled ? { kind: "shown", text: NOT_EDITABLE_NOTE } : { kind: "none" },
    switchTo: selected.inUse
      ? { kind: "hidden" }
      : {
          kind: "shown",
          disabled: turnInProgress,
          title: turnInProgress ? SWITCH_BLOCKED_TITLE : undefined,
          onSwitch: () => {
            dispatch.session.switchCharacter({ name: pack })
          },
        },
    editProfile: disabled
      ? { kind: "hidden" }
      : {
          kind: "shown",
          name: character.name ?? "",
          tagline: character.tagline ?? "",
          onSubmit: (name, tagline) => {
            dispatch.characterPack.setProfile({ pack, name, tagline })
          },
        },
  }

  return {
    kind: "ready",
    profile,
    disabled,
    cards,
    workAccent,
    chatAccent,
    resetChatAccent,
    outfitAccents,
    face,
    background,
    deleteBand,
  }
}

/** カードから送る2つ（どちらも選んでいるパックへ書く）。 */
type PortraitSenders = {
  readonly pick: (expression: Expression, image: string) => void
  readonly clear: (expression: RemovableExpression) => void
}

/** 表情のカードを `EXPRESSIONS` の順に畳む。 */
function portraitCards(
  character: CharacterInfo,
  galleryAccent: string,
  send: PortraitSenders,
): readonly PortraitCardModel[] {
  // `default` は消せないので1回だけ解けばよい（消す前の確かめの本文がどのカードでも同じ値を読む）。
  const fallbackLabel = resolveExpressionLabel(character.expressions, "default")
  return EXPRESSIONS.map((expression): PortraitCardModel => {
    const label = resolveExpressionLabel(character.expressions, expression)
    // 畳んだ表では `default` の絵が入っているので、自分の絵を持つ表情だけを引く。
    const url = character.expressionsWithPortrait.includes(expression)
      ? character.portraits?.[expression]
      : undefined
    const sendImage = (image: string): void => {
      send.pick(expression, image)
    }
    return {
      expression,
      label,
      badge:
        expression === "default"
          ? { kind: "shown", text: DEFAULT_EXPRESSION_BADGE }
          : { kind: "none" },
      image:
        url === undefined
          ? { kind: "blank" }
          : { kind: "shown", url, accent: galleryAccent, outfit: GALLERY_OUTFIT },
      pickAriaLabel: `${label}を${url === undefined ? "選ぶ" : "差し替える"}`,
      onPick: (input) => {
        void readPicked(input, sendImage)
      },
      onDropFile: (file) => {
        void readFile(file, sendImage)
      },
      clear:
        isRemovableExpression(expression) && url !== undefined
          ? {
              kind: "shown",
              ariaLabel: `${label}を消す`,
              fallbackLabel,
              onClear: clearOf(expression, send),
            }
          : { kind: "hidden" },
    }
  })
}

/** 消す口の呼び先（消せる表情に絞ったあとで作る。閉包の中では絞り込みが効かないため）。 */
function clearOf(expression: RemovableExpression, send: PortraitSenders): () => void {
  return () => {
    send.clear(expression)
  }
}

/**
 * 選ばれた画像を data URL にして `send` へ渡す。同じファイルをもう一度選べるように `value` を
 * 戻す（戻さないと `change` が起きない）。読めなかった回は何も送らない。
 */
async function readPicked(input: HTMLInputElement, send: (image: string) => void): Promise<void> {
  const file = input.files?.[0]
  input.value = ""
  if (file === undefined) {
    return
  }

  await readFile(file, send)
}

/** 1つのファイルを data URL にして `send` へ渡す（中身の検証はサーバ側）。 */
async function readFile(file: File, send: (image: string) => void): Promise<void> {
  const image = await readDataUrl(file)
  if (image !== undefined) {
    send(image)
  }
}

/**
 * 帯とダイアログの文言・押せるか・送り先を畳む（`removal` が `"none"` でないときだけ呼ぶ）。
 * 打った id が一致するかどうかの判定は `CharacterDeleteConfirm` が持つ。
 */
function deleteBandOf(
  removal: Exclude<CharacterPackRemoval, "none">,
  character: CharacterInfo,
  inUse: boolean,
  dispatch: SessionDispatch,
): CharacterDeleteBandModel {
  const copy = DELETE_COPY[removal]
  const name = character.name ?? character.pack
  return {
    kind: "shown",
    pack: character.pack,
    heading: copy.heading,
    note: copy.note,
    buttonLabel: `${name} を${copy.verb}`,
    dialogHeading: `${name} を${copy.dialogQuestion}`,
    dialogNote: copy.dialogNote(character.expressionsWithPortrait.length),
    okLabel: copy.verb,
    face:
      character.face === undefined ? { kind: "absent" } : { kind: "shown", url: character.face },
    disabled: inUse,
    title: inUse ? copy.blockedTitle : undefined,
    onSubmit: () => {
      dispatch.characterPack.delete({ pack: character.pack })
    },
  }
}
