// 狭い画面の右の丸ボタン（■ か ↑）のロジック。押す先は `useTurnStatus` の `action` と同じで、■ だけ確かめの札を挟む。

import { useState } from "react"

import { useComposerDraft } from "../../../../../../../../stores/composer-draft.ts"
import { useTurnStatus } from "./use-turn-status.ts"

export type PhoneTurnActionModel =
  | {
      readonly kind: "interrupt"
      readonly confirming: boolean
      readonly onAsk: () => void
      readonly onStop: () => void
      readonly onKeep: () => void
    }
  | {
      readonly kind: "send"
      readonly label: string
      readonly title: string
      readonly disabled: boolean
    }

export function usePhoneTurnAction(): PhoneTurnActionModel {
  const { action } = useTurnStatus()
  const drafted = useComposerDraft((state) => state.draft.text.trim() !== "")
  const [confirming, setConfirming] = useState(false)

  if (action.kind === "interrupt") {
    return {
      kind: "interrupt",
      confirming,
      onAsk: () => {
        setConfirming(true)
      },
      onStop: () => {
        setConfirming(false)
        action.onInterrupt()
      },
      onKeep: () => {
        setConfirming(false)
      },
    }
  }
  return {
    kind: "send",
    label: action.label,
    title: action.title,
    disabled: action.disabled || !drafted,
  }
}
