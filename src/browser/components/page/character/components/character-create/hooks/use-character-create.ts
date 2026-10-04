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
// 作れなかったとき（断られた・切れた）はダイアログを閉じず、id の欄の下に失敗を出す。

import { useState } from "react"

import { isCharacterPackName } from "../../../../../../../shared/character-pack/character.ts"
import { readAccentColor } from "../../../../../../domain/appearance-color.ts"
import { selectPack } from "../../../../../../stores/screen.tsx"
import { useSession } from "../../../../../../stores/session.ts"
import { readDataUrl } from "../../../../../../utils/data-url.ts"
import type { AccentSwatchModel } from "../../../domain/accent-swatch-model.ts"

const NAME_HINT = "画面や吹き出しに出る名前"
const ID_HINT =
  "半角の英数字と . _ - が使えます（. では始められません）。保存するフォルダの名前になります"
const INVALID_ID_NOTE = "id に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_ID_NOTE = "その id はもう使われている"
const FAILED_NOTE = "作れなかった。もう一度押すか、id を変えてみてください"

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
  | { readonly kind: "invalid" | "taken" | "failed"; readonly text: string }

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
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const characterPacks = useSession((session) => session.state.characterPacks)

  const [name, setName] = useState("")
  const [id, setId] = useState("")
  const [portraitImage, setPortraitImage] = useState<string | undefined>(undefined)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  const [chatAccent, setChatAccent] = useState(readAccentColor)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function holdPortraitFile(file: File): Promise<void> {
    const image = await readDataUrl(file)
    if (image !== undefined) {
      setPortraitImage(image)
    }
  }

  const taken = id !== "" && characterPacks.some((pack) => pack.name === id)
  const validFormat = isCharacterPackName(id)
  const canSubmit = validFormat && !taken && portraitImage !== undefined && !sending

  async function create(): Promise<void> {
    if (!canSubmit || portraitImage === undefined) {
      return
    }

    setSending(true)
    setFailed(false)
    try {
      await dispatchAwaited.characterPack.create({
        id,
        name,
        portraits: { default: portraitImage },
        accent,
        chatAccent,
      })
    } catch {
      setFailed(true)
      setSending(false)
      return
    }
    selectPack(id)
    onClose()
  }

  const idNote: CreateIdNoteModel = taken
    ? { kind: "taken", text: TAKEN_ID_NOTE }
    : id !== "" && !validFormat
      ? { kind: "invalid", text: INVALID_ID_NOTE }
      : failed
        ? { kind: "failed", text: FAILED_NOTE }
        : { kind: "hint", text: ID_HINT }

  return {
    open,
    form: {
      nameHint: NAME_HINT,
      name,
      onNameChange: setName,
      id,
      onIdChange: (next) => {
        setId(next)
        setFailed(false)
      },
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
      onSubmit: () => {
        void create()
      },
    },
  }
}
