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
import { OUTFITS, type Outfit } from "../../../../../../shared/character-pack/expression.ts"
import { readAccentColor } from "../../../../../domain/appearance-color.ts"
import { useSession, useTurnRunning } from "../../../../../stores/session.ts"
import type { AccentSwatchModel } from "../../domain/accent-swatch-model.ts"
import {
  BACKGROUND_FILE_ACCEPT,
  BACKGROUND_LABEL,
  FACE_FILE_ACCEPT,
  FACE_LABEL,
  GALLERY_OUTFIT,
  NOT_EDITABLE_NOTE,
  OUTFIT_LABELS,
  SWITCH_BLOCKED_TITLE,
} from "../../domain/character-edit-copy.ts"
import type {
  CharacterDeleteBandModel,
  CharacterEditModel,
  CharacterProfileModel,
  ChatAccentResetModel,
  ImageFieldModel,
  OutfitAccentFieldModel,
} from "../../domain/character-edit-model.ts"
import { readPicked } from "../../domain/picked-image.ts"
import { portraitCards } from "../../domain/portrait-card.ts"
import { deleteBandOf } from "./character-delete-band.ts"
import { useHeldAccent } from "./use-held-accent.ts"
import { useSelectedPack } from "./use-selected-pack.ts"

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
