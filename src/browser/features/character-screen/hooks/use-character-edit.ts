// `<CharacterEdit>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// いまのキャラクターの姿を、立ち絵のカード・衣装ごとの差し色・背景の行へ畳み、選んだ画像を
// data URL にして送る呼び先と一緒に返す。
//
// 送るのは `set-portrait` / `clear-portrait` / `set-outfit-accent` / `set-accent` /
// `clear-chat-accent` / `set-background` / `clear-background` で、**書き込み先と反映はサーバ側**
// （`src/server/adapter/character-edit.ts` → `character-changed`）。ここは選んだ画像を data URL
// にして渡すだけで、素材をブラウザ側に持ち続けない。
//
// **`default` には消す口を出さない**（立ち絵が必ず要る1つ。`src/shared/expression.ts` の
// `REQUIRED_EXPRESSIONS`。送られてきても `src/shared/command.ts` のスキーマが弾く）。
//
// **16進の色をここに書かない**（差し色はキャラクター定義の値で、定義に無い衣装の初期値は
// `--accent` から読む。`appearance-color.ts` の `readAccentColor`）。**`--accent` はキャラクター
// を切り替えたとき（起こし直しで作り直る）しか変わらないので、マウント時に1回だけ読んで
// `accentFallback` に持つ**（描画のたびに `getComputedStyle` を呼ばない）。
//
// 差し色を引きずっている間は、**見た目（この立ち絵の `accent` と `<input>` の表示）だけ
// その場で更新し、`set-outfit-accent` / `set-accent` の送信は `useDebouncedCallback` で
// 200ms まとめる**（`src/server/adapter/character-edit.ts` が送信のたびに `character.json` を
// 書き直すため）。**衣装の差し色（`outfitAccents`）と画面の差し色（`accent` / `chatAccent`）は
// 同じ「ドラッグ中の色」という操作**なので、同じ定数（`ACCENT_DEBOUNCE_MS`）を使う
// （`docs/screen-design.md` 13.6）。

import { useState } from "react"

import { type AccentTarget } from "../../../../shared/character-definition.ts"
import { resolveExpressionLabel } from "../../../../shared/expression-choice.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type Outfit,
  OUTFITS,
} from "../../../../shared/expression.ts"
import { readAccentColor } from "../../../domain/appearance-color.ts"
import { readDataUrl } from "../../../lib/data-url.ts"
import { useDebouncedCallback } from "../../../lib/debounce.ts"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"

/** 背景の行の、いまの状態を表す字（**印だけにしない**。13.1 原則1）。 */
const BACKGROUND_LABEL = { present: "いまの背景", absent: "背景なし" } as const

/**
 * 衣装のラベル。**モデルの重さ（装備の重さ）の言い方はどのキャラクターでも同じ**なので画面側が
 * 持つ（`docs/requirements.md` 4.3。表情のラベルはキャラクター定義から取る）。
 */
const OUTFIT_LABELS: Readonly<Record<Outfit, string>> = {
  default: "既定",
  light: "軽装（haiku）",
  normal: "通常装備（sonnet）",
  heavy: "戦闘配置（opus）",
}

/** カードの立ち絵に当てる衣装。並びでは衣装の違いを出さない（差し色の行がその役目）。 */
const GALLERY_OUTFIT: Outfit = "default"

/**
 * 差し色の送信をまとめる間隔。ドラッグ中の1回1回を送らず、離れてから1回にする。**衣装の差し色と
 * 画面の差し色（仕事 / 雑談）の両方が使う**。
 */
const ACCENT_DEBOUNCE_MS = 200

/** 立ち絵のカード1枚。**自分の絵を持たない表情は `blank`**（点線の枠の空きを出す）。 */
export type PortraitCardModel = {
  readonly expression: Expression
  readonly label: string
  readonly image:
    | { readonly kind: "blank" }
    | {
        readonly kind: "shown"
        readonly url: string
        readonly accent: string
        readonly outfit: Outfit
      }
  /** 選ぶ口の見える字（「選ぶ」か「差し替える」）。 */
  readonly pickText: string
  /** 選ぶ口の読み上げ（どの表情のことか。カードが狭いので見える字には入れない）。 */
  readonly pickAriaLabel: string
  readonly onPick: (input: HTMLInputElement) => void
  /** 消す口（`default` と、自分の絵が無い表情には出さない）。 */
  readonly clear:
    | { readonly kind: "hidden" }
    | { readonly kind: "shown"; readonly ariaLabel: string; readonly onClear: () => void }
}

/** 差し色の欄1つ（衣装ごと）。 */
export type OutfitAccentFieldModel = {
  readonly outfit: Outfit
  readonly inputId: string
  readonly label: string
  readonly value: string
  readonly onChange: (color: string) => void
}

/** 画面の差し色の欄1つ（仕事 / 雑談）。`outfitAccents` とは別の最上位の欄（`accent` / `chatAccent`）。 */
export type ScreenAccentFieldModel = {
  readonly inputId: string
  readonly label: string
  readonly value: string
  readonly onChange: (color: string) => void
}

/**
 * 雑談の差し色を「仕事と同じ」へ戻す口。`chatAccent` を持たないパック（雑談も仕事と同じ差し色の
 * まま）では出さない——戻すものが無いため。代わりにその場所へ「仕事と同じ」の字を出す
 * （`presentational-character-edit.tsx`）。
 */
export type ChatAccentResetModel =
  | { readonly kind: "hidden" }
  | { readonly kind: "shown"; readonly onClick: () => void }

/** 背景の行。**字（`label`）は有無どちらでも出す**。 */
export type BackgroundFieldModel = {
  readonly image: { readonly kind: "absent" } | { readonly kind: "present"; readonly url: string }
  readonly label: string
  readonly onPick: (input: HTMLInputElement) => void
  readonly onClear: () => void
}

/** `<CharacterEdit>` が画面に出す形。presenter は `kind` で出し分けて置くだけ。 */
export type CharacterEditModel =
  | {
      /** まだ `character-changed` が届いていない（接続直後の一瞬）。口を出すものが決まらない。 */
      readonly kind: "waiting"
    }
  | {
      readonly kind: "ready"
      /** 画面から変えられないパック。口をすべて塞ぎ、理由の一言を出す。 */
      readonly disabled: boolean
      readonly cards: readonly PortraitCardModel[]
      /** 画面の差し色（仕事）。`accent` を差す。 */
      readonly workAccent: ScreenAccentFieldModel
      /** 画面の差し色（雑談）。`chatAccent` を持たなければ、仕事の差し色をそのまま見本に出す。 */
      readonly chatAccent: ScreenAccentFieldModel
      readonly resetChatAccent: ChatAccentResetModel
      readonly outfitAccents: readonly OutfitAccentFieldModel[]
      readonly background: BackgroundFieldModel
    }

export function useCharacterEdit(): CharacterEditModel {
  const dispatch = useSessionDispatch()
  const character = useSessionSelector((session) => session.state.character)
  // 引きずっている間だけ見た目を先に進める上書き（衣装ごと）。**サーバへ送るのは
  // `sendOutfitAccent` 側でまとめる**ので、ここは表示専用（`docs/coding-standards.md`
  // 「useEffect の代わりに使うもの」の「利用者の操作で起きること」＝イベントハンドラで足す）。
  const [pendingAccents, setPendingAccents] = useState<Partial<Record<Outfit, string>>>({})
  // 画面の差し色（仕事 / 雑談）も同じ考え方で先に進める（衣装とは別の最上位の欄なので別の状態）。
  const [pendingScreenAccents, setPendingScreenAccents] = useState<
    Partial<Record<AccentTarget, string>>
  >({})
  // 差し色が定義に無い衣装・パックの初期値（`--accent`）。読みは描画の外（マウント時の1回）に置く。
  const [accentFallback] = useState(readAccentColor)
  const sendOutfitAccent = useDebouncedCallback<Outfit, string>((outfit, color) => {
    dispatch({ type: "set-outfit-accent", outfit, color })
  }, ACCENT_DEBOUNCE_MS)
  const sendAccent = useDebouncedCallback<AccentTarget, string>((target, color) => {
    dispatch({ type: "set-accent", target, color })
  }, ACCENT_DEBOUNCE_MS)

  if (character === undefined) {
    return { kind: "waiting" }
  }

  const accentOf = (outfit: Outfit): string =>
    pendingAccents[outfit] ?? character.outfitAccents[outfit] ?? accentFallback

  const galleryAccent = accentOf(GALLERY_OUTFIT)
  const cards = EXPRESSIONS.map((expression): PortraitCardModel => {
    const label = resolveExpressionLabel(character.expressions, expression)
    // 畳んだ表では `default` の絵が入っているので、自分の絵を持つ表情だけを引く。
    const url = character.expressionsWithPortrait.includes(expression)
      ? character.portraits?.[expression]
      : undefined
    const pickText = url === undefined ? "選ぶ" : "差し替える"
    return {
      expression,
      label,
      image:
        url === undefined
          ? { kind: "blank" }
          : { kind: "shown", url, accent: galleryAccent, outfit: GALLERY_OUTFIT },
      pickText,
      pickAriaLabel: `${label}を${pickText}`,
      onPick: (input) => {
        void readPicked(input, (image) => {
          dispatch({ type: "set-portrait", expression, image })
        })
      },
      clear:
        isRemovableExpression(expression) && url !== undefined
          ? {
              kind: "shown",
              ariaLabel: `${label}を消す`,
              onClear: () => {
                dispatch({ type: "clear-portrait", expression })
              },
            }
          : { kind: "hidden" },
    }
  })

  const outfitAccents = OUTFITS.map((outfit): OutfitAccentFieldModel => ({
    outfit,
    inputId: `character-outfit-accent-${outfit}`,
    label: OUTFIT_LABELS[outfit],
    value: accentOf(outfit),
    onChange: (color) => {
      setPendingAccents((current) => ({ ...current, [outfit]: color }))
      sendOutfitAccent(outfit, color)
    },
  }))

  // 仕事の差し色（`accent`）。無ければ `--accent`（既定値）に落ちる。衣装の差し色と同じ解き方。
  const workAccentValue = pendingScreenAccents.work ?? character.accent ?? accentFallback
  const workAccent: ScreenAccentFieldModel = {
    inputId: "character-screen-accent-work",
    label: "仕事",
    value: workAccentValue,
    onChange: (color) => {
      setPendingScreenAccents((current) => ({ ...current, work: color }))
      sendAccent("work", color)
    },
  }

  // 雑談の差し色（`chatAccent`）。**持たないパックでは仕事の差し色をそのまま見本に出す**
  // （「仕事と同じ」であることが色そのもので伝わる。ドラッグ中の仕事の値も追いかける）。
  const hasChatAccent =
    pendingScreenAccents.chat !== undefined || character.chatAccent !== undefined
  const chatAccentValue = pendingScreenAccents.chat ?? character.chatAccent ?? workAccentValue
  const chatAccent: ScreenAccentFieldModel = {
    inputId: "character-screen-accent-chat",
    label: "雑談",
    value: chatAccentValue,
    onChange: (color) => {
      setPendingScreenAccents((current) => ({ ...current, chat: color }))
      sendAccent("chat", color)
    },
  }
  const resetChatAccent: ChatAccentResetModel = hasChatAccent
    ? {
        kind: "shown",
        onClick: () => {
          setPendingScreenAccents((current) => ({ ...current, chat: undefined }))
          dispatch({ type: "clear-chat-accent" })
        },
      }
    : { kind: "hidden" }

  const background: BackgroundFieldModel = {
    image:
      character.background === undefined
        ? { kind: "absent" }
        : { kind: "present", url: character.background.image },
    label: character.background === undefined ? BACKGROUND_LABEL.absent : BACKGROUND_LABEL.present,
    // 背景も立ち絵と同じ受け渡し（data URL）。
    onPick: (input) => {
      void readPicked(input, (image) => {
        dispatch({ type: "set-background", image })
      })
    },
    onClear: () => {
      dispatch({ type: "clear-background" })
    },
  }

  return {
    kind: "ready",
    disabled: !character.editable,
    cards,
    workAccent,
    chatAccent,
    resetChatAccent,
    outfitAccents,
    background,
  }
}

/**
 * 選ばれた画像を data URL にして `send` へ渡す。**同じファイルをもう一度選べるように `value` を
 * 戻す**（戻さないと `change` が起きない）。読めなかった回は何も送らない。
 */
async function readPicked(input: HTMLInputElement, send: (image: string) => void): Promise<void> {
  const file = input.files?.[0]
  input.value = ""
  if (file === undefined) {
    return
  }

  const image = await readDataUrl(file)
  if (image !== undefined) {
    send(image)
  }
}
