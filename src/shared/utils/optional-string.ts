// 「文字列なら返す、それ以外は undefined」の物差し（外来の値のフィールドを境界で検証するときに使う）。

/** 値が文字列ならそのまま返し、そうでなければ `undefined`。 */
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
