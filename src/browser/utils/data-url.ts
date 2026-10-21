// 画面で選ばれたファイルを data URL にする。
//
// 読めなかったときは例外を投げず undefined を返す。呼び出し側はその1枚を諦める。

export function readDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : undefined)
    })
    reader.addEventListener("error", () => {
      resolve(undefined)
    })
    reader.readAsDataURL(file)
  })
}
