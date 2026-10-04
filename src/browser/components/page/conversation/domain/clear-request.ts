/** 依頼の文面の先頭トークンがちょうど `/clear` か（`/clear-foo` のような別名は false）。 */
export function isClearRequest(text: string): boolean {
  return text.split(/\s/, 1)[0] === "/clear"
}
