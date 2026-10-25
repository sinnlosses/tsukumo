// `--size`・`--viewport` の値（`<幅>x<高さ>`）を読む。

export type WindowSize = { readonly width: number; readonly height: number }

/** 読めなければ undefined。 */
export function parseSize(value: string): WindowSize | undefined {
  const parts = value.split("x")
  const width = Number(parts[0])
  const height = Number(parts[1])
  if (parts.length !== 2 || !Number.isInteger(width) || !Number.isInteger(height)) {
    return undefined
  }
  return width > 0 && height > 0 ? { width, height } : undefined
}
