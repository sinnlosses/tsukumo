// メインビューでターンの前後へ移るキー（`[` が1つ古いほう、`]` が1つ新しいほう）と、見出しの前後へ移るキー（`{` が前、`}` が後ろ）と、紙の読む深さ・畳みのキー（`d`・`o`）の読み取りと、ターンの移り先の選び方。

export type TurnStep = "older" | "newer"

export type TurnStepKeyEvent = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly isComposing: boolean
  readonly target?: EventTarget
}

const STEP_KEYS = { "[": "older", "]": "newer" } as const satisfies Record<string, TurnStep>

const EDITABLE = "input, textarea, select, [contenteditable]"

const HEADING_KEYS = { "{": "older", "}": "newer" } as const satisfies Record<string, TurnStep>

/** 入力要素の中・変換中・修飾キー付きはブラウザと入力に譲る。 */
export function turnStepOf(event: TurnStepKeyEvent): TurnStep | undefined {
  if (yieldsToInput(event)) {
    return undefined
  }
  return event.key === "[" || event.key === "]" ? STEP_KEYS[event.key] : undefined
}

/** `{` が1つ前の見出し、`}` が1つ後ろの見出し。 */
export function headingStepOf(event: TurnStepKeyEvent): TurnStep | undefined {
  if (yieldsToInput(event)) {
    return undefined
  }
  return event.key === "{" || event.key === "}" ? HEADING_KEYS[event.key] : undefined
}

/** 新しい器の紙で、`d` が読む深さを回し、`o` が全節を畳む・開き、`?` がキーの一覧を出す。ほかのキーは `none`。 */
export function readingKeyOf(event: TurnStepKeyEvent): "depth" | "fold" | "help" | "none" {
  if (yieldsToInput(event)) {
    return "none"
  }
  return event.key === "d"
    ? "depth"
    : event.key === "o"
      ? "fold"
      : event.key === "?"
        ? "help"
        : "none"
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

function yieldsToInput(event: TurnStepKeyEvent): boolean {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
    return true
  }
  return event.target instanceof Element && event.target.closest(EDITABLE) !== null
}
