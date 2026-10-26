// 複数ファイルの一括置換とテンプレート展開が使う、文字列の変換だけを持つ。

export type Replacement = { readonly text: string; readonly count: number }

export function replaceAll(text: string, from: string, to: string): Replacement {
  const parts = text.split(from)
  return { text: parts.join(to), count: parts.length - 1 }
}

/** `{{名前}}` を `values` の値に置き換える。`values` に無い名前があれば、その名前を挙げて投げる。 */
export function expandTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_placeholder, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`値に {{${name}}} が無い`)
    }
    return value
  })
}
