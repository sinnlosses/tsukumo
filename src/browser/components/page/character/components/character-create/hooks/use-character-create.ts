// 新しく作るダイアログのロジック。
// 名前・id・立ち絵1枚・画面の差し色2つ（仕事・雑談）の作りかけの値を持ち、押せるか・id の欄の下に出す一言・作る先を畳んで返す。
// 表情を足す・衣装ごとに差し色を分ける・背景を敷くのは、作ったあと `<CharacterEdit>` の側で行う。
//
// 作れたら一覧で作ったパックを選んだ状態にして、呼び出し元へ閉じたことを知らせる。
// `session.switchCharacter` は送らない（切り替えは `<CharacterEdit>` の「このキャラクターに切り替える」の仕事）。
//
// 下書きの掃除はこのフックでは行わない。
// 閉じるたびに呼び出し元が `<CharacterCreate>` を `key` で作り直すので、次に開いたときは自然に空へ戻る。
//
// id の形はサーバと同じ規則（`isCharacterPackName`）で先に見て、送ってから黙って落ちるのではなく、押せない理由を id の欄の下に出す。
// 断られたこと（手続きの `REFUSED`）は画面にまだ出していない。

import { useEffect, useState } from "react"

import { isCharacterPackName } from "../../../../../../../shared/character-pack/character.ts"
import { readAccentColor } from "../../../../../../domain/appearance-color.ts"
import { selectPack } from "../../../../../../stores/screen.tsx"
import { useSession } from "../../../../../../stores/session.ts"
import { readDataUrl } from "../../../../../../utils/data-url.ts"
import type { AccentSwatchModel } from "../../accent-swatch/accent-swatch.tsx"

const NAME_HINT = "画面や吹き出しに出る名前"
const ID_HINT =
  "半角の英数字と . _ - が使えます（. では始められません）。保存するフォルダの名前になります"
const INVALID_ID_NOTE = "id に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_ID_NOTE = "その id はもう使われている"

/** 必須の立ち絵（`default`）を選ぶ大きな枠。 */
export type PortraitDropModel = {
  readonly image: { readonly kind: "blank" } | { readonly kind: "picked"; readonly url: string }
  readonly pickAriaLabel: string
  readonly onPick: (input: HTMLInputElement) => void
  readonly onDropFile: (file: File) => void
}

/** id の欄の下に出す一言。空・形が合う・押せる間は静かな案内、崩れたら理由に変わる。 */
export type CreateIdNoteModel =
  | { readonly kind: "hint"; readonly text: string }
  | { readonly kind: "invalid" | "taken"; readonly text: string }

export type CharacterCreateModel = {
  readonly open: boolean
  readonly form: {
    readonly nameHint: string
    readonly name: string
    readonly onNameChange: (name: string) => void
    readonly id: string
    readonly onIdChange: (id: string) => void
    readonly idNote: CreateIdNoteModel
    readonly portrait: PortraitDropModel
    readonly workAccent: AccentSwatchModel
    readonly chatAccent: AccentSwatchModel
    readonly canSubmit: boolean
    readonly onSubmit: () => void
  }
}

/** `open` と、作れたら閉じて呼び出し元へ返す `onClose` は呼び出し側の state。 */
export function useCharacterCreate(open: boolean, onClose: () => void): CharacterCreateModel {
  const dispatch = useSession((session) => session.dispatch)
  const characterPacks = useSession((session) => session.state.characterPacks)

  const [name, setName] = useState("")
  const [id, setId] = useState("")
  const [portraitImage, setPortraitImage] = useState<string | undefined>(undefined)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  const [chatAccent, setChatAccent] = useState(readAccentColor)
  // 送った id。作れたかどうかは一覧に出たかで見る（断られたことは画面に出していないので、
  // 成否の手がかりはこれだけ）。
  const [sentId, setSentId] = useState<string | undefined>(undefined)

  // 送った id が一覧に出たら作れている。
  // 一覧でそのパックを選んだ状態にして、呼び出し元へ閉じたことを知らせる。
  useEffect(() => {
    if (sentId !== undefined && characterPacks.some((pack) => pack.name === sentId)) {
      selectPack(sentId)
      onClose()
    }
  }, [sentId, characterPacks, onClose])

  async function holdPortraitFile(file: File): Promise<void> {
    const image = await readDataUrl(file)
    if (image !== undefined) {
      setPortraitImage(image)
    }
  }

  const taken = id !== "" && characterPacks.some((pack) => pack.name === id)
  const validFormat = isCharacterPackName(id)
  const canSubmit = validFormat && !taken && portraitImage !== undefined

  function create(): void {
    if (!canSubmit || portraitImage === undefined) {
      return
    }

    dispatch.characterPack.create({
      id,
      name,
      portraits: { default: portraitImage },
      accent,
      chatAccent,
    })
    setSentId(id)
  }

  const idNote: CreateIdNoteModel = taken
    ? { kind: "taken", text: TAKEN_ID_NOTE }
    : id !== "" && !validFormat
      ? { kind: "invalid", text: INVALID_ID_NOTE }
      : { kind: "hint", text: ID_HINT }

  return {
    open,
    form: {
      nameHint: NAME_HINT,
      name,
      onNameChange: setName,
      id,
      onIdChange: setId,
      idNote,
      portrait: {
        image:
          portraitImage === undefined ? { kind: "blank" } : { kind: "picked", url: portraitImage },
        pickAriaLabel:
          portraitImage === undefined
            ? "いつもの顔の立ち絵を選ぶ"
            : "いつもの顔の立ち絵を差し替える",
        onPick: (input) => {
          const file = input.files?.[0]
          if (file !== undefined) {
            void holdPortraitFile(file)
          }
        },
        onDropFile: (file) => {
          void holdPortraitFile(file)
        },
      },
      workAccent: {
        inputId: "character-create-accent-work",
        label: "仕事",
        sublabel: { kind: "none" },
        ariaLabel: "仕事",
        value: accent,
        onChange: setAccent,
      },
      chatAccent: {
        inputId: "character-create-accent-chat",
        label: "雑談",
        sublabel: { kind: "none" },
        ariaLabel: "雑談",
        value: chatAccent,
        onChange: setChatAccent,
      },
      canSubmit,
      onSubmit: create,
    },
  }
}
