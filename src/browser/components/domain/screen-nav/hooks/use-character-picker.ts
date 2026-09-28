// 帯の左上のキャラクターの顔と、押すと開くキャラクターの選び口のロジック。
// 送るのは `session.switchCharacter`（起こし直し）。
//
// 選び口は2箇所に描かれる（広い画面の帯・狭い画面の「≡」の面の中）。
// 開閉の状態は1つで、閉じる合図は `useDismissSignal`、Esc の戻り先の顔は2箇所ぶんをコールバック ref で集める。

import { useRef, useState, type RefCallback, type RefObject } from "react"

import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { useDismissSignal, type DismissCause } from "../../../../hooks/use-dismiss-signal.ts"
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
  const [open, setOpen] = useState(false)
  const toggleNodes = useRef(new Set<HTMLButtonElement>())

  function onToggle(): void {
    setOpen((wasOpen) => !wasOpen)
  }

  const toggleRef: RefCallback<HTMLButtonElement> = (node) => {
    // cleanup を返す形なので React 19 は `null` で呼び直さない（外れるのは下の cleanup）。
    if (node === null) {
      return
    }
    const nodes = toggleNodes.current
    nodes.add(node)
    return () => {
      nodes.delete(node)
    }
  }

  function onDismiss(cause: DismissCause): void {
    setOpen(false)
    if (cause === "escape") {
      // 押せる状態にある顔は1つだけ（もう片方は `display: none` で `.focus()` が効かない）。
      for (const node of toggleNodes.current) {
        node.focus()
      }
    }
  }

  useDismissSignal({ open, rootRef: navRef, onDismiss })

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
      setOpen(false)
      const picked = packs.find((pack) => pack.name === name)
      if (!turnInProgress && picked !== undefined && !picked.inUse) {
        dispatch.session.switchCharacter({ name })
      }
    },
    toggleRef,
  }
}
