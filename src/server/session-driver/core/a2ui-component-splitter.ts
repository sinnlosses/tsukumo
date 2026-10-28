// `report` の引数の JSON を断片で受けながら、`components` の配列の要素が閉じるたびに 1 部品を取り出す。
// 状態は戻り値で運ぶ。閉じていない要素は返さない。

export type SplitState = {
  /** 文字列の外で開いている `{` と `[` の数。 */
  readonly depth: number
  readonly inString: boolean
  readonly escaped: boolean
  /** 深さ 1 で直前に閉じた文字列（`components` のキーかを見る）。 */
  readonly lastKey: string
  readonly currentString: string
  /** `components` の配列の中にいる。 */
  readonly inComponents: boolean
  /** 取り出し中の要素の文字（`{` から）。 */
  readonly element: string
}

export const INITIAL_SPLIT_STATE: SplitState = {
  depth: 0,
  inString: false,
  escaped: false,
  lastKey: "",
  currentString: "",
  inComponents: false,
  element: "",
}

export type SplitStep = {
  readonly state: SplitState
  readonly components: readonly unknown[]
}

/** 断片 1 つ分を読み進め、この断片で閉じた部品を返す。 */
export function splitComponents(state: SplitState, fragment: string): SplitStep {
  return [...fragment].reduce<SplitStep>(
    (step, char) => {
      const next = advance(step.state, char)
      return {
        state: next.state,
        components: [...step.components, ...next.closed],
      }
    },
    { state, components: [] },
  )
}

/** 切り出した部品の列が、全文を `JSON.parse` した `components` と食い違う件数（数の差も含む）。 */
export function mismatchCount(components: readonly unknown[], wholeText: string): number {
  const whole: unknown = JSON.parse(wholeText)
  const expected =
    typeof whole === "object" &&
    whole !== null &&
    "components" in whole &&
    Array.isArray(whole.components)
      ? (whole.components as readonly unknown[])
      : []
  const length = Math.max(expected.length, components.length)
  return Array.from({ length }).filter(
    (_, index) => JSON.stringify(expected[index]) !== JSON.stringify(components[index]),
  ).length
}

function advance(
  state: SplitState,
  char: string,
): { readonly state: SplitState; readonly closed: readonly unknown[] } {
  const collecting = state.inComponents && state.depth >= 3
  const withElement = collecting || (state.inComponents && state.depth === 2 && char === "{")
  const element = withElement ? state.element + char : state.element

  if (state.inString) {
    if (state.escaped) {
      return { state: { ...state, escaped: false, element }, closed: [] }
    }
    if (char === "\\") {
      return { state: { ...state, escaped: true, element }, closed: [] }
    }
    if (char === '"') {
      return {
        state: {
          ...state,
          inString: false,
          element,
          lastKey: state.depth === 1 ? state.currentString : state.lastKey,
          currentString: "",
        },
        closed: [],
      }
    }
    return { state: { ...state, element, currentString: state.currentString + char }, closed: [] }
  }

  if (char === '"') {
    return { state: { ...state, inString: true, element, currentString: "" }, closed: [] }
  }
  if (char === "{" || char === "[") {
    return {
      state: {
        ...state,
        depth: state.depth + 1,
        element,
        inComponents:
          state.inComponents ||
          (char === "[" && state.depth === 1 && state.lastKey === "components"),
      },
      closed: [],
    }
  }
  if (char === "}" || char === "]") {
    const depth = state.depth - 1
    if (char === "}" && state.inComponents && depth === 2) {
      return {
        state: { ...state, depth, element: "" },
        closed: [JSON.parse(element)],
      }
    }
    return {
      state: {
        ...state,
        depth,
        element,
        inComponents: state.inComponents && !(char === "]" && depth === 1),
      },
      closed: [],
    }
  }
  return { state: { ...state, element }, closed: [] }
}
