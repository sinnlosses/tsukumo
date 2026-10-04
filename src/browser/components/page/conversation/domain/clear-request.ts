/** 依頼の文面の先頭トークンがちょうど `/clear` か（`/clear-foo` のような別名は false）。 */
export function isClearRequest(text: string): boolean {
  return text.split(/\s/, 1)[0] === "/clear"
}

/** 先頭トークンがちょうど `/clear` で、続けて空白でない字がある文面か（本体は続きを捨てる）。 */
export function isClearWithArgs(text: string): boolean {
  return /^\/clear\s+\S/.test(text)
}
