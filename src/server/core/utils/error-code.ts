// Node の system error が持つ文字列の `code`（ENOENT・ESRCH など）を確かめる道具。

/** `error` が `Error` で、文字列の `code` が `code` と等しいか。 */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
