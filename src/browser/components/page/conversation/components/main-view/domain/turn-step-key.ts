// メインビューでターンの前後へ移るキー（`[` が1つ古いほう、`]` が1つ新しいほう）の読み取りと、移り先の選び方。

export type TurnStep = "older" | "newer"

export type TurnStepKeyEvent = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly isComposing: boolean
  readonly target: EventTarget | null
}

const STEP_KEYS = { "[": "older", "]": "newer" } as const satisfies Record<string, TurnStep>

const EDITABLE = "input, textarea, select, [contenteditable]"

/** 入力要素の中・変換中・修飾キー付きはブラウザと入力に譲る。 */
export function turnStepOf(event: TurnStepKeyEvent): TurnStep | undefined {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
    return undefined
  }
  if (event.target instanceof Element && event.target.closest(EDITABLE) !== null) {
    return undefined
  }
  return event.key === "[" || event.key === "]" ? STEP_KEYS[event.key] : undefined
}

/** `turnIds` は古い順。端では `undefined`。 */
export function neighborTurnId(
  turnIds: readonly number[],
  activeTurnId: number,
  step: TurnStep,
): number | undefined {
  const index = turnIds.indexOf(activeTurnId)
  if (index < 0) {
    return undefined
  }
  return turnIds[step === "older" ? index - 1 : index + 1]
}
