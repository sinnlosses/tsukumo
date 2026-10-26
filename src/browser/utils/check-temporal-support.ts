// ブラウザが Temporal を持つかを見て、持たないときは描き始める前に案内を出す。
// 持たないブラウザ（Safari など）では時計の読み取りで落ち、初回の描画が止まるため、polyfill は入れずに案内で済ませる。

const UNSUPPORTED_BROWSER_MESSAGE =
  "このブラウザでは動きません。Chromium 系か Firefox 139 以降で開いてください。"

/** 判定の対象（通常は `globalThis`）に `Temporal` があるか。対象を引数で受けるのは、無い環境を単体テストで作るため。 */
export function isTemporalSupported(scope: object): boolean {
  return "Temporal" in scope
}

/** 案内の文を `root` の中身として出す。描画の続きは呼び出し側が止める。 */
export function showUnsupportedBrowserNotice(root: Element): void {
  const notice = root.ownerDocument.createElement("p")
  notice.setAttribute("role", "alert")
  notice.style.padding = "16px"
  notice.textContent = UNSUPPORTED_BROWSER_MESSAGE
  root.replaceChildren(notice)
}
