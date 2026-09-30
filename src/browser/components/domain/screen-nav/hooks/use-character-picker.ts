// 帯の左上のキャラクターの顔と、押すと開くキャラクターの選び口のロジック。
// 送るのは `session.switchCharacter`（起こし直し）。
//
// 選び口は2箇所に描かれる（広い画面の帯・狭い画面の「≡」の面の中）。
// 開閉は `usePopover` に任せる。

import type { RefCallback, RefObject } from "react"
import { doNothing } from "remeda"

import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { usePopover } from "../../../../hooks/use-popover.ts"
import { useSession, useTurnRunning } from "../../../../stores/session.ts"

export type CharacterPickerOption = {
  readonly name: string
  readonly label: string
  readonly face: CharacterFaceInfo
  readonly inUse: boolean
}

export type ScreenNavCharacterPicker = {
  /** いまのパックの顔（顔の無いパックでは `<CharacterFace>` が何も描かない）。 */
  readonly face: CharacterFaceInfo
  /** 読み上げに渡す名前（いまのキャラクターの名前を添える）。 */
  readonly label: string
  readonly open: boolean
  readonly options: readonly CharacterPickerOption[]
  /** ターン進行中は選べない（起こし直しなので）。 */
  readonly blocked: boolean
  readonly blockedTitle: string | undefined
  readonly onToggle: () => void
  readonly onPick: (name: string) => void
  /** Esc で閉じたときにフォーカスを戻す顔の DOM を預ける口（2箇所に描かれる）。 */
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

const PICKER_LABEL = "キャラクターを選ぶ"

export function useCharacterPicker(
  navRef: RefObject<HTMLElement | null>,
): ScreenNavCharacterPicker {
  const dispatch = useSession((session) => session.dispatch)
  const character = useSession((session) => session.state.character)
  const packs = useSession((session) => session.state.characterPacks)
  const turnInProgress = useTurnRunning()
  const { open, onToggle, close, toggleRef } = usePopover({ rootRef: navRef, onReset: doNothing })

  const face = characterFaceInfo(character)
  return {
    face,
    label: face.alt === "" ? PICKER_LABEL : `${PICKER_LABEL}（いまは ${face.alt}）`,
    open,
    options: packs.map((pack) => ({
      name: pack.name,
      label: pack.label,
      face: characterFaceInfo(pack.character),
      inUse: pack.inUse,
    })),
    blocked: turnInProgress,
    blockedTitle: turnInProgress ? FRAME_ERROR_REASON.switchDuringTurn : undefined,
    onToggle,
    onPick: (name) => {
      close()
      const picked = packs.find((pack) => pack.name === name)
      if (!turnInProgress && picked !== undefined && !picked.inUse) {
        dispatch.session.switchCharacter({ name })
      }
    },
    toggleRef,
  }
}
