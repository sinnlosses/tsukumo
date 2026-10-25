// 新しく作るダイアログのロジック。
// 名前・id・立ち絵1枚・画面の差し色2つ（仕事・雑談）・ペルソナの作りかけの値を持ち、押せるか・欄の下に出す一言・作る先を畳んで返す。
// 表情を足す・背景を敷くのは、作ったあと `<CharacterEdit>` の側で行う。
//
// 「立ち絵から生成」を押すと、置いた立ち絵からサーバが生成した id・名前・差し色2つ・人格で5つの欄を上書きする。
// 置いただけでは生成しない。生成中は「作る」も押せず、生成できなかったときは欄と立ち絵に触らずボタンの下に知らせる。
//
// 作れたら一覧で作ったパックを選んだ状態にして、呼び出し元へ閉じたことを知らせる。
// `session.switchCharacter` は送らない（切り替えは `<CharacterEdit>` の「このキャラクターに切り替える」の仕事）。
//
// 下書きの掃除はこのフックでは行わない。
// 閉じるたびに呼び出し元が `<CharacterCreate>` を `key` で作り直すので、次に開いたときは自然に空へ戻る。
//
// id の形はサーバと同じ規則（`parseCharacterPackName`）で先に見て、送ってから黙って落ちるのではなく、押せない理由を id の欄の下に出す。
// 作れなかったとき（断られた・切れた）はダイアログを閉じず、id の欄の下に失敗を出す。

import { useState } from "react"

import { parseCharacterPackName } from "../../../../../../../shared/character-pack/character.ts"
import type { GeneratedCharacter } from "../../../../../../../shared/character-pack/generated-character.ts"
import { MAX_PORTRAIT_BYTES } from "../../../../../../../shared/character-pack/portrait-image.ts"
import { readAccentColor } from "../../../../../../domain/appearance-color.ts"
import { selectPack } from "../../../../../../stores/screen.tsx"
import { useSession } from "../../../../../../stores/session.ts"
import { readDataUrl } from "../../../../../../utils/data-url.ts"
import { promptReadyDataUrl } from "../../../../../../utils/raster-image.ts"
import type { AccentSwatchModel } from "../../../domain/accent-swatch-model.ts"
import { CREATE_PORTRAIT_TOO_LARGE_NOTE } from "../../../domain/character-edit-copy.ts"

const NAME_HINT = "画面や吹き出しに出る名前"
const ID_HINT =
  "半角の英数字と . _ - が使えます（. では始められません）。保存するフォルダの名前になります"
const INVALID_ID_NOTE = "id に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_ID_NOTE = "その id はもう使われている"
const FAILED_NOTE = "作れなかった。もう一度押すか、id を変えてみてください"
const GENERATE_LABEL = "立ち絵から生成"
const GENERATING_LABEL = "生成中…"
const GENERATION_HINT = "置いた立ち絵から名前・id・差し色・人格を書きます。書いたあとで直せます"
const GENERATION_STAGES = [
  { stage: "prepare", label: "立ち絵を整える" },
  { stage: "write", label: "設定を書く" },
] as const
const GENERATION_FAILED_NOTE = "生成できなかった。もう一度押すか、手で入れてください"
const PERSONA_HINT = "口調や性格を書く。空なら人格なしで作る"

/** 必須の立ち絵（`default`）を選ぶ大きな枠。 */
export type PortraitDropModel = {
  readonly image: { readonly kind: "blank" } | { readonly kind: "picked"; readonly url: string }
  readonly pickAriaLabel: string
  readonly note: { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }
  readonly onPick: (input: HTMLInputElement) => void
  readonly onDropFile: (file: File) => void
}

/** id の欄の下に出す一言。空・形が合う・押せる間は静かな案内、崩れたら理由に変わる。 */
type CreateIdNoteModel =
  | { readonly kind: "hint"; readonly text: string }
  | { readonly kind: "invalid" | "taken" | "failed"; readonly text: string }

type GenerationStage = (typeof GENERATION_STAGES)[number]["stage"]

/** 生成中の段の並び。済んだ段・いまの段・まだの段を `state` で言う。 */
type GenerationProgressModel =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running"
      readonly steps: readonly {
        readonly label: string
        readonly state: "done" | "current" | "pending"
      }[]
    }

/** 「立ち絵から生成」のボタンと、その下の一言・進み。 */
type CharacterGenerationModel = {
  readonly label: string
  readonly progress: GenerationProgressModel
  readonly canGenerate: boolean
  readonly onGenerate: () => void
  readonly note: { readonly kind: "hint" | "failed"; readonly text: string }
}

type CreatePersonaModel = {
  readonly hint: string
  readonly value: string
  readonly onChange: (persona: string) => void
}

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
    readonly generation: CharacterGenerationModel
    readonly workAccent: AccentSwatchModel
    readonly chatAccent: AccentSwatchModel
    readonly persona: CreatePersonaModel
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
  const [persona, setPersona] = useState("")
  const [portraitTooLarge, setPortraitTooLarge] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [generationStage, setGenerationStage] = useState<GenerationStage | undefined>(undefined)
  const generating = generationStage !== undefined
  const [generationFailed, setGenerationFailed] = useState(false)

  async function holdPortraitFile(file: File): Promise<void> {
    if (file.size > MAX_PORTRAIT_BYTES) {
      setPortraitTooLarge(true)
      return
    }
    setPortraitTooLarge(false)
    const image = await readDataUrl(file)
    if (image !== undefined) {
      setPortraitImage(image)
    }
  }

  const taken = id !== "" && characterPacks.some((pack) => pack.name === id)
  const validFormat = parseCharacterPackName(id) !== undefined
  const canSubmit = validFormat && !taken && portraitImage !== undefined && !sending && !generating
  const canGenerate = portraitImage !== undefined && !generating && !sending

  async function generate(): Promise<void> {
    if (!canGenerate || portraitImage === undefined) {
      return
    }

    setGenerationStage("prepare")
    setGenerationFailed(false)
    const generated = await requestGenerated(portraitImage)
    setGenerationStage(undefined)
    if (generated === undefined) {
      setGenerationFailed(true)
      return
    }
    setId(generated.id)
    setName(generated.name)
    setAccent(generated.accent)
    setChatAccent(generated.chatAccent)
    setPersona(generated.persona)
    setFailed(false)
  }

  /** 立ち絵を送って生成した欄の値を受け取る。直せない・断られた・切れたときは undefined。 */
  async function requestGenerated(image: string): Promise<GeneratedCharacter | undefined> {
    const portrait = await promptReadyDataUrl(image)
    if (portrait === undefined) {
      return undefined
    }
    setGenerationStage("write")
    try {
      return await dispatchAwaited.characterPack.generateFromPortrait({ portrait })
    } catch {
      return undefined
    }
  }

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
        persona,
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
        note: portraitTooLarge
          ? { kind: "shown", text: CREATE_PORTRAIT_TOO_LARGE_NOTE }
          : { kind: "none" },
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
      generation: {
        label: generating ? GENERATING_LABEL : GENERATE_LABEL,
        progress: toGenerationProgress(generationStage),
        canGenerate,
        onGenerate: () => {
          void generate()
        },
        note: generationFailed
          ? { kind: "failed", text: GENERATION_FAILED_NOTE }
          : { kind: "hint", text: GENERATION_HINT },
      },
      workAccent: {
        inputId: "character-create-accent-work",
        label: "仕事",
        value: accent,
        onChange: setAccent,
      },
      chatAccent: {
        inputId: "character-create-accent-chat",
        label: "雑談",
        value: chatAccent,
        onChange: setChatAccent,
      },
      persona: { hint: PERSONA_HINT, value: persona, onChange: setPersona },
      canSubmit,
      onSubmit: () => {
        void create()
      },
    },
  }
}

function toGenerationProgress(current: GenerationStage | undefined): GenerationProgressModel {
  if (current === undefined) {
    return { kind: "idle" }
  }
  const currentIndex = GENERATION_STAGES.findIndex(({ stage }) => stage === current)
  return {
    kind: "running",
    steps: GENERATION_STAGES.map(({ label }, index) => ({
      label,
      state: index < currentIndex ? "done" : index === currentIndex ? "current" : "pending",
    })),
  }
}
