// 画面で選ばれたファイルを data URL にする。**素材の受け渡しはこの形1つ**
// （`docs/design.md` 7.1。立ち絵は data URL を JSON に載せて WebSocket のコマンドで送る）。
//
// 読めなかったときに例外を投げないのは、**画面は1回の失敗で落ちない**ため
// （`docs/coding-standards.md`「エラーハンドリング」）。呼び出し側はその1枚を諦める。
//
// 読み手は2つの機能（キャラクター画面の素材と、入力欄の `components/page/conversation/dispatch/prompt-image.ts`）。
// 包んでいるのは `FileReader` で、ファイル名が指すのも data URL という**形式**なので `lib/`
// （`docs/design.md` 2章「`lib/` と `utils/` に置く基準」）。

/** 選ばれたファイルを data URL にする。読めなかったときは undefined。 */
export function readDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : undefined)
    }
    reader.onerror = () => {
      resolve(undefined)
    }
    reader.readAsDataURL(file)
  })
}
