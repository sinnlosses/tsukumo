// 「空白だけでない文字列なら返す、それ以外は undefined」の物差し（外来の値の任意のフィールドを境界で検証するときに使う）。

/** 文字列で、空白だけでないときだけ返す（`report` の任意の引数の「無い」を1つに畳む）。 */
export function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}
