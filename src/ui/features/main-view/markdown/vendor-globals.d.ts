// `vendor/` に同梱した外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// **ライブラリ本体は npm から入れていない**（`vendor/README.md`。CDN も使わず、自分のサーバから
// 配る）ので、型定義も付いてこない。ここに**使っている分だけ**を手で書く。使っていない API を
// 足さない（書いた分が「使ってよい」の線になる）。
//
// **DOM を morph するライブラリと hljs は無い**（移行の段6。領域の差し替えごと DOM を書き換える経路は消え、
// コードの色付けは `rehype-highlight` が hast の時点で済ませるので、ブラウザ側で
// `hljs.highlightElement` を呼ぶ経路も無くなった。docs/design.md 6.4 / 12章）。

declare global {
  /**
   * mermaid（`vendor/mermaid.min.js`）。**`src/ui/features/main-view/markdown/mermaid-block.tsx`
   * が図の記法を見つけたときだけ**動的に読み込むので、参照する時点（読み込みの `then` の中）
   * では必ず存在する。
   */
  const mermaid: {
    readonly initialize: (options: {
      readonly startOnLoad: boolean
      readonly theme: string
      readonly securityLevel: string
      /**
       * 失敗したときに mermaid 自身がエラーの絵を `<pre class="mermaid">` の中へ描くのを止める。
       * `true` だと `run()` は絵を描くかわりに Promise を reject する
       * （`src/ui/features/main-view/markdown/mermaid-block.tsx` が拾う）。
       */
      readonly suppressErrorRendering: boolean
    }) => void
    readonly run: (options: { readonly nodes: readonly Element[] }) => Promise<void>
  }

  /**
   * Chart.js（`vendor/chart.umd.min.js`）。mermaid と同じく、必要になったときだけ読み込む。
   * `defaults` は**明るい背景向けの既定値**（文字 `#666`・目盛り線 `rgba(0,0,0,0.1)`）を
   * 暗い配色へ寄せるためだけに触る（`src/ui/features/main-view/markdown/chart-block.tsx`）。
   */
  const Chart: (new (target: Element, config: unknown) => unknown) & {
    readonly defaults: { color: string; borderColor: string }
  }
}

export {}
