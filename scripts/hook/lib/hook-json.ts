// hook が標準入力へ流す JSON から、形を問わずに欄を読む。

/** 壊れた JSON は `undefined`。 */
export function safeParse(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput)
  } catch {
    return undefined
  }
}

export function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined
}

export function readString(value: unknown, key: string): string | undefined {
  const field = readField(value, key)
  return typeof field === "string" ? field : undefined
}
