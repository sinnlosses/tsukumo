// 色のトークン名から実効の色を引く口の形と、引いた色を覚えて読み直しを減らす包み。

/**
 * 実効の色（sRGB の 0〜1 と不透明度）。
 * トークンは `color-mix(...)` の式で持っているので、字の明暗を決めるには一度ブラウザに解決させた値が要る。
 */
export type ResolvedColor = {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

/** トークン名から実効の色を引く口。無いトークン・色でないトークンは `undefined`。 */
export type ColorTokenReader = (name: string) => ResolvedColor | undefined

/**
 * 読み口を包み、同じ名前は stamp が変わるまで覚えた色を返す（`undefined` も覚える）。
 * 色を動かす書き込みはすべてルート要素の style 属性に入る（上書きの3色・差し色）ので、stamp にはその属性の文字列を渡す。
 */
export function cachedColorTokenReader(
  read: ColorTokenReader,
  stamp: () => string,
): ColorTokenReader {
  let remembered:
    | { readonly stamp: string; readonly colors: Map<string, ResolvedColor | undefined> }
    | undefined
  return (name) => {
    const current = stamp()
    if (remembered?.stamp !== current) {
      remembered = { stamp: current, colors: new Map() }
    }
    if (!remembered.colors.has(name)) {
      remembered.colors.set(name, read(name))
    }
    return remembered.colors.get(name)
  }
}
