// `<CharacterCreate>`（新しく作るダイアログ）のロジック（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。名前・id・立ち絵1枚・画面の差し色2つ（仕事・雑談）の作りかけの値を持ち、
// 押せるか・id の欄の下に出す一言・作る先を presenter がそのまま置ける形へ畳んで返す。
//
// **受け取るのは名前・id・必須の立ち絵1枚・画面の差し色2つだけ**で、表情を足す・衣装ごとに
// 差し色を分ける・背景を敷くのは作ったあと `<CharacterEdit>` の側で行う（作る口は最低限にする。
// `docs/design.md` 7.1）。
//
// **`<Dialog>` は常にマウントし、`open` に開閉だけを追随させる**（`components/ui/dialog/dialog.tsx`。
// `features/task-board/hooks/use-task-board.ts` と同じ形）。**作れたら一覧で作ったパックを選んだ
// 状態にして、呼び出し元へ閉じたことを知らせる**（`switch-character` は送らない。切り替えは
// `<CharacterEdit>` の「このキャラクターに切り替える」の仕事。`docs/screen-design.md` 13.6）。
//
// **下書きの掃除はこのフックでは行わない。** 閉じるたびに呼び出し元（`character-screen.tsx`）が
// `<CharacterCreate>` を `key` で作り直すので、次に開いたときは自然に空へ戻る
// （`docs/coding-standards.md`「useEffect の代わりに使うもの」の「props が変わったら state を
// 捨てる」）。**`onClose` はこのフックの戻り値に含めない**（`features/task-board/task-board.tsx`
// と同じ形で、素通りする prop は呼び出し側〔`character-create.tsx`〕が直接つなぐ）。
//
// **id の形はサーバと同じ規則で先に見る**（`src/shared/character.ts` の `isCharacterPackName`）。
// 送ってから黙って落ちるのではなく、押せない理由を id の欄の下に出す（`error` フレームは
// 画面にまだ出していない）。

import { useEffect, useState } from "react"

import { isCharacterPackName } from "../../../../../shared/character.ts"
import { readAccentColor } from "../../../../domain/appearance-color.ts"
import { readDataUrl } from "../../../../lib/data-url.ts"
import { selectPack } from "../../../../stores/screen.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../../stores/session.tsx"
import { type AccentSwatchModel } from "./use-character-edit.ts"

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

/**
 * `open` と、作れたら閉じて呼び出し元へ返す `onClose` は呼び出し側（`character-screen.tsx`）の
 * state。表示上の状態なので URL には持たせない（`stores/location-hash.ts`）。
 */
export function useCharacterCreate(open: boolean, onClose: () => void): CharacterCreateModel {
  const dispatch = useSessionDispatch()
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)

  const [name, setName] = useState("")
  const [id, setId] = useState("")
  const [portraitImage, setPortraitImage] = useState<string | undefined>(undefined)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  const [chatAccent, setChatAccent] = useState(readAccentColor)
  // 送った id。**作れたかどうかは一覧に出たかで見る**（`error` フレームは画面に出していないので、
  // 成否の手がかりはこれだけ）。
  const [sentId, setSentId] = useState<string | undefined>(undefined)

  // 送った id が一覧に出たら作れている。一覧でそのパックを選んだ状態にして、呼び出し元へ
  // 閉じたことを知らせる（切り替えはしない。`docs/screen-design.md` 13.6）。**下書きの掃除は
  // ここでは行わない**（上の注記）。`selectPack`（URL）と `onClose`（呼び出し元の開閉）という
  // React の外にある状態への書き込みなので `useEffect`
  // （`docs/coding-standards.md`「React」の4類型の2つ目）。
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

    dispatch({
      type: "create-character",
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
