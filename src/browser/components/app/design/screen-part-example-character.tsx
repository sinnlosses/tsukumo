// 見本帳の「画面の部品」のうち、キャラクターの画面の部品（作る・編集）の例。
// 画像の素材は持たせない（素材が無いときの姿になる）。作るダイアログは、開くボタンを置いて押すと出す。

import { useState, type ReactElement } from "react"

import { PresentationalCharacterCreate } from "../../page/character/components/character-create/presentational-character-create.tsx"
import { PresentationalCharacterEdit } from "../../page/character/components/character-edit/presentational-character-edit.tsx"
import type {
  CharacterEditModel,
  ImageFieldModel,
  PortraitCardModel,
} from "../../page/character/domain/character-edit-model.ts"
import { Button } from "../../ui/button/button.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

function imageField(
  kind: ImageFieldModel["kind"],
  subject: string,
  label: string,
): ImageFieldModel {
  return {
    kind,
    subject,
    accept: "image/png",
    image: { kind: "absent" },
    label,
    rejection: { kind: "none" },
    onPick: noop,
    onClear: noop,
  }
}

function card(
  expression: PortraitCardModel["expression"],
  label: string,
  badge: PortraitCardModel["badge"],
): PortraitCardModel {
  return {
    expression,
    label,
    badge,
    image: { kind: "blank" },
    pickAriaLabel: `${label}の絵を選ぶ`,
    onPick: noop,
    onDropFile: noop,
    clear: { kind: "hidden" },
  }
}

const EDIT: CharacterEditModel = {
  kind: "ready",
  profile: {
    name: "さくら",
    id: "sakura",
    face: { kind: "absent" },
    inUse: true,
    tagline: { kind: "shown", text: "のんびり屋の相棒" },
    note: { kind: "none" },
    switchTo: { kind: "hidden" },
    editProfile: { kind: "shown", name: "さくら", tagline: "のんびり屋の相棒", onSubmit: noop },
    editPersona: {
      kind: "shown",
      persona: "穏やかに話す。",
      onSubmit: () => Promise.resolve({ kind: "saved" }),
    },
  },
  disabled: false,
  cards: [
    card("default", "いつもの顔", { kind: "shown", text: "いつもの顔" }),
    card("thinking", "考え中", { kind: "none" }),
    card("proud", "得意げ", { kind: "none" }),
  ],
  portraitRejection: { kind: "none" },
  workAccent: {
    inputId: "design-work-accent",
    label: "仕事の差し色",
    value: "#3b6ea5",
    onChange: noop,
  },
  chatAccent: {
    inputId: "design-chat-accent",
    label: "雑談の差し色",
    value: "#c0577a",
    onChange: noop,
  },
  resetChatAccent: { kind: "shown", onClick: noop },
  face: imageField("face", "顔", "顔の絵"),
  mini: imageField("mini", "ミニ立ち絵", "ミニ立ち絵"),
  background: imageField("background", "背景", "背景の絵"),
  items: {
    seats: [],
    items: [],
    add: { disabled: false, title: undefined, onOpen: noop },
    addDialog: { kind: "closed" },
    removeConfirm: { kind: "closed" },
  },
  deleteBand: { kind: "hidden" },
}

function CreateOpener(): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="action"
        pressed="none"
        disabled={false}
        disclosure={{ kind: "none" }}
        className=""
        onClick={() => {
          setOpen(true)
        }}
      >
        キャラクターを作るダイアログを開く
      </Button>
      <PresentationalCharacterCreate
        open={open}
        onClose={() => {
          setOpen(false)
        }}
        form={{
          nameHint: "例: さくら",
          name: "",
          onNameChange: noop,
          id: "",
          onIdChange: noop,
          idNote: { kind: "hint", text: "半角の英数字とハイフン" },
          portrait: {
            image: { kind: "blank" },
            pickAriaLabel: "立ち絵を選ぶ",
            note: { kind: "none" },
            onPick: noop,
            onDropFile: noop,
          },
          generation: {
            label: "立ち絵から生成",
            progress: { kind: "idle" },
            canGenerate: false,
            onGenerate: noop,
            note: { kind: "hint", text: "立ち絵を選ぶと使えます" },
          },
          workAccent: {
            inputId: "design-create-work",
            label: "仕事の差し色",
            value: "#3b6ea5",
            onChange: noop,
          },
          chatAccent: {
            inputId: "design-create-chat",
            label: "雑談の差し色",
            value: "#c0577a",
            onChange: noop,
          },
          persona: { hint: "話し方や性格を書く", value: "", onChange: noop },
          canSubmit: false,
          onSubmit: noop,
        }}
      />
    </>
  )
}

export const CHARACTER_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/character/components/character-edit/presentational-character-edit.tsx",
    render: () => <PresentationalCharacterEdit {...EDIT} />,
  },
  {
    frame: "flow",
    path: "page/character/components/character-create/presentational-character-create.tsx",
    render: () => <CreateOpener />,
  },
]
