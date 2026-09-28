// 外部ライブラリを `<script>` で読み込む（配るのは tsukumo 自身のサーバ）。
// その記法が実際に出てきたときだけ読むので、`<head>` へ置くのはここが最初に呼ばれた瞬間。
//
// 同じ URL を何度読み込んでも1回のリクエストで済むよう、読み込み中の Promise をモジュールのトップレベルで覚えておく（図もグラフも、複数のブロックが同時に現れて実際に `<script>` を足すのは最初の1回だけ）。

const loaded = new Map<string, Promise<void>>()

/** `src` のスクリプトを読み込む。2回目以降は同じ Promise を返す（キャッシュ）。 */
export function loadVendorScript(src: string): Promise<void> {
  const existing = loaded.get(src)
  if (existing !== undefined) {
    return existing
  }

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.addEventListener("load", () => {
      resolve()
    })
    script.addEventListener("error", () => {
      reject(new Error(src))
    })
    document.head.appendChild(script)
  })

  loaded.set(src, loading)
  return loading
}
