// catch で受けた unknown を、表示できる文字列へ畳む道具。

/** `Error` なら `message`、それ以外は `String()` で文字列にする。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
