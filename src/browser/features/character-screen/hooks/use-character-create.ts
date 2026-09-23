// `<CharacterCreate>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 作りかけの名前・選んだ立ち絵・差し色を持ち、押せるか・名前の欄の下に出す一言・作る／
// 切り替えるの送り先を、presenter がそのまま置ける形へ畳んで返す。
//
// 受け取るのは**名前・必須の立ち絵1枚・差し色1色**だけで、表情を足す・衣装ごとに差し色を
// 分けるのは作ったあと `<CharacterEdit>` の側で行う（作る口は最低限にする）。
//
// **作っても自動では切り替わらない**（切り替えは駆動の起こし直しで画面が初期化されるので、
// 作る操作の副作用にしない。docs/design.md 7.1）。作れたら「このキャラクターに切り替える」を
// 出し、**押したときだけ** `switch-character` を送ってキャラクター画面へ戻る。ターン進行中は
// 押せない（サイドバーの `<select>` と同じ理由・同じ文言）。
//
// **名前の形はサーバと同じ規則で先に見る**（`src/shared/character.ts` の
// `isCharacterPackName`）。送ってから黙って落ちるのではなく、押せない理由を画面に出すため
// （`error` フレームは画面にまだ出していない）。

import { useState } from "react"

import { isCharacterPackName } from "../../../../shared/character.ts"
import { resolveExpressionLabel } from "../../../../shared/expression-choice.ts"
import { REQUIRED_EXPRESSIONS, type RequiredExpression } from "../../../../shared/expression.ts"
import { FRAME_ERROR_REASON } from "../../../../shared/frame.ts"
import { readAccentColor } from "../../../lib/appearance-color.ts"
import { readDataUrl } from "../../../lib/data-url.ts"
import { navigateTo, useScreenHref } from "../../../stores/screen.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"

const INVALID_NAME_NOTE = "名前に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_NAME_NOTE = "その名前はもう使われている"
const CREATED_NOTE = "作った。"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。理由の文面は**サーバが
// 断るときと同じ1つ**（`shared` の定型文）を使う（サイドバーの `<select>` と同じ）。
const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/** 選んだ立ち絵（data URL）。**必須の1つぶん**で、そろうまで「作る」は押せない。 */
type HeldPortraits = Readonly<Record<RequiredExpression, string | undefined>>

const NO_PORTRAITS: HeldPortraits = { default: undefined }

/** 必須の立ち絵を選ぶ欄1つ。 */
export type CreatePortraitFieldModel = {
  readonly expression: RequiredExpression
  readonly inputId: string
  /** 表情の呼び名はキャラクターごとの言葉なので、いま出しているパックのラベルを借りる（原則4）。 */
  readonly label: string
  readonly onPick: (input: HTMLInputElement) => void
}

/** 名前の欄の下に出す一言。作れたあとだけ「切り替える」を添える。 */
export type CreateNoteModel =
  | { readonly kind: "none" }
  | { readonly kind: "message"; readonly text: string }
  | {
      readonly kind: "created"
      readonly text: string
      readonly switchDisabled: boolean
      /** 押せない理由（`title`。React の `title` がそのまま undefined を受けるので畳まない）。 */
      readonly switchTitle: string | undefined
      readonly onSwitch: () => void
    }

/** `<CharacterCreate>` が画面に出す形。**戻る口は常に出す**（行き止まりにしない）。 */
export type CharacterCreateModel = {
  readonly backHref: string
  readonly form:
    | {
        /**
         * まだ `character-changed` が届いていない（接続直後の一瞬）。表情のラベルが決まらない
         * ので口を出さない。
         */
        readonly kind: "waiting"
      }
    | {
        readonly kind: "ready"
        readonly name: string
        readonly onNameChange: (name: string) => void
        readonly portraitFields: readonly CreatePortraitFieldModel[]
        readonly accent: string
        readonly onAccentChange: (accent: string) => void
        readonly note: CreateNoteModel
        readonly canSubmit: boolean
        readonly onSubmit: () => void
      }
}

export function useCharacterCreate(): CharacterCreateModel {
  const screenHref = useScreenHref()
  const dispatch = useSessionDispatch()
  const character = useSessionSelector((session) => session.state.character)
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const [name, setName] = useState("")
  const [portraits, setPortraits] = useState<HeldPortraits>(NO_PORTRAITS)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  // 最後に送った名前。**作れたかどうかは一覧に出たかで見る**（`error` フレームは画面に
  // 出していないので、成否の手がかりはこれだけ）。
  const [sentName, setSentName] = useState<string | undefined>(undefined)
  const backHref = screenHref("character")

  if (character === undefined) {
    return { backHref, form: { kind: "waiting" } }
  }

  const taken = characterPacks.some((pack) => pack.name === name)
  const filled = REQUIRED_EXPRESSIONS.every((expression) => portraits[expression] !== undefined)
  const canSubmit = isCharacterPackName(name) && !taken && filled

  /** 選ばれた画像を data URL にして持つ（送るのは「作る」を押したとき1回だけ）。 */
  async function holdPortrait(
    expression: RequiredExpression,
    input: HTMLInputElement,
  ): Promise<void> {
    const file = input.files?.[0]
    if (file === undefined) {
      return
    }

    const image = await readDataUrl(file)
    if (image !== undefined) {
      setPortraits((held) => ({ ...held, [expression]: image }))
    }
  }

  function create(): void {
    const defaultImage = portraits.default
    if (!canSubmit || defaultImage === undefined) {
      return
    }

    dispatch({ type: "create-character", name, portraits: { default: defaultImage }, accent })
    setSentName(name)
  }

  /** 作ったパックへ切り替えて、キャラクター画面へ戻る（整える続きはそちらで行う）。 */
  function switchTo(created: string): void {
    dispatch({ type: "switch-character", name: created })
    navigateTo("character")
  }

  const portraitFields = REQUIRED_EXPRESSIONS.map((expression): CreatePortraitFieldModel => ({
    expression,
    inputId: `character-create-portrait-${expression}`,
    label: `${resolveExpressionLabel(character.expressions, expression)}の立ち絵`,
    onPick: (input) => {
      void holdPortrait(expression, input)
    },
  }))

  return {
    backHref,
    form: {
      kind: "ready",
      name,
      onNameChange: setName,
      portraitFields,
      accent,
      onAccentChange: setAccent,
      note: createNote(name, taken, sentName, turnInProgress, switchTo),
      canSubmit,
      onSubmit: create,
    },
  }
}

/** 名前の欄の下に出す一言を畳む。送った名前が一覧に出た ＝ サーバ側に書けた。 */
function createNote(
  name: string,
  taken: boolean,
  sentName: string | undefined,
  turnInProgress: boolean,
  switchTo: (created: string) => void,
): CreateNoteModel {
  if (sentName !== undefined && name === sentName && taken) {
    return {
      kind: "created",
      text: CREATED_NOTE,
      switchDisabled: turnInProgress,
      switchTitle: turnInProgress ? SWITCH_BLOCKED_TITLE : undefined,
      onSwitch: () => {
        switchTo(sentName)
      },
    }
  }
  if (taken) {
    return { kind: "message", text: TAKEN_NAME_NOTE }
  }
  return name !== "" && !isCharacterPackName(name)
    ? { kind: "message", text: INVALID_NAME_NOTE }
    : { kind: "none" }
}
