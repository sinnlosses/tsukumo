export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type SafeParseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

export function parseJsonWith<T>(schema: SafeParseSchema<T>, text: string): T | undefined {
  const parsed = schema.safeParse(parseJson(text))
  return parsed.success ? parsed.data : undefined
}
