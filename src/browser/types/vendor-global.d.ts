// 外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// パッケージは npm にあるが、束ねずに素の JavaScript を `<script>` で読む（`readVendorAsset`）ので、そこから型は付いてこない。
// ここに使っている分だけを手で書く。使っていない API を足さない（書いた分が「使ってよい」の線になる）。

declare global {
  /**
   * mermaid（`/vendor/mermaid.min.js` から読む）。
   * `MermaidBlock` が図の記法を見つけたときだけ動的に読み込むので、参照する時点（読み込みの `then` の中）では必ず存在する。
   */
  const mermaid: {
    readonly initialize: (options: {
      readonly startOnLoad: boolean
      readonly theme: string
      readonly securityLevel: string
      /**
       * 失敗したときに mermaid 自身がエラーの絵を `<pre class="mermaid">` の中へ描くのを止める。
       * `true` だと `render()` は絵を描くかわりに Promise を reject する。
       */
      readonly suppressErrorRendering: boolean
    }) => void
    /** `id` は SVG の `id` と中の `<style>` の接頭辞になる。 */
    readonly render: (
      id: string,
      code: string,
    ) => Promise<{
      readonly svg: string
      readonly bindFunctions: ((element: Element) => void) | undefined
    }>
  }

  /**
   * Chart.js（`/vendor/chart.umd.min.js` から読む）。mermaid と同じく、必要になったときだけ読み込む。
   * `defaults` は、明るい背景向けの既定値（文字も目盛り線も黒寄り）を暗い配色へ寄せるのと、`.chart-block` の
   * 高さへ収めるために触る（`loadChart`）。
   * `borderColor` は書かない。4.5.0 から、そこが既定から動いていると内蔵の colors プラグインが系列に色を配らなくなるので、線の色は `scale` の側へ書く。
   */
  const Chart: (new (
    target: Element,
    config: unknown,
  ) => {
    /**
     * 描いたものを捨てて `<canvas>` を明け渡す。
     * 同じ `<canvas>` に描き直す前に必ず呼ぶ（Chart.js は使用中の canvas に二度目を描こうとすると例外を投げる）。
     */
    readonly destroy: () => void
  }) & {
    readonly defaults: {
      color: string
      maintainAspectRatio: boolean
      readonly scale: {
        readonly grid: { color: string }
        readonly border: { color: string }
      }
    }
  }
}

export {}
