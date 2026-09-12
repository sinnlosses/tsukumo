// `vendor/` に同梱した外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// **ライブラリ本体は npm から入れていない**（`vendor/README.md`。CDN も使わず、自分のサーバから
// 配る）ので、型定義も付いてこない。ここに**使っている分だけ**を手で書く。使っていない API を
// 足さない（書いた分が「使ってよい」の線になる）。

declare global {
  interface Window {
    /** Idiomorph 0.8.0（`vendor/idiomorph.min.js`）。DOM を捨てずに差分だけ当てる。 */
    readonly Idiomorph: {
      /**
       * `target` の中身を `html` に合わせる。`morphStyle: "innerHTML"` は中身だけを対象にし、
       * `target` 自身は残す。
       */
      readonly morph: (
        target: Element,
        html: string,
        options: { readonly morphStyle: "innerHTML" | "outerHTML" },
      ) => void
    }
  }
}

export {}
