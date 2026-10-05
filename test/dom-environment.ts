// vitest の設定の `test.setupFiles` から、テストファイルごとに1回読まれる。
// `src/browser/` の部品テスト（`@testing-library/react`）が要る DOM のグローバルを用意する。
//
// `happy-dom` の `Window` が持つ全部を `globalThis` へコピーしない。 `fetch` / `WebSocket` /
// `setTimeout` / `console` まで happy-dom のものに差し替わると、実際の HTTP・WebSocket を使う
// 他のテストが巻き添えになる。DOM を組み立てる部品だけを
// 借りる（Vitest がテストファイルごとにモジュールの登録を分けるので、この設定はファイルの外へは漏れない）。
//
// `@happy-dom/global-registrator`（this 一式を1関数でやってくれる別パッケージ）は使わない
// （`docs/architecture/build.md`「ビルドと依存」の依存一覧に無い。ここは持ってきた `happy-dom` だけで済ませる）。

import { Window } from "happy-dom"

/**
 * 借りる DOM のグローバル。React・react-dom・@testing-library/react が `instanceof` や
 * `document.createElement` の戻り値の型として触れるものだけ（実際にレンダリングと
 * `fireEvent` を通して確かめた最小集合）。
 */
const BORROWED_DOM_GLOBAL_NAMES = [
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "HTMLDivElement",
  "HTMLSpanElement",
  "HTMLParagraphElement",
  "HTMLAnchorElement",
  "HTMLHeadingElement",
  "HTMLUListElement",
  "HTMLLIElement",
  "HTMLLabelElement",
  "HTMLButtonElement",
  "HTMLSelectElement",
  "HTMLOptionElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLFormElement",
  // `typedElement` の `instanceof` でクエリの戻り値を絞り込むテストが要る
  // （立ち絵・顔・背景の `<img>`、Markdown の表の `<td>`、折りたたみの `<details>`）。
  "HTMLImageElement",
  "HTMLTableCellElement",
  "HTMLDetailsElement",
  "Event",
  "CustomEvent",
  "UIEvent",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "FocusEvent",
  "MutationObserver",
  // `useFitDiaryPage`（日記帳の右ページの本文を測って縮める）が、ページの大きさの変化を購読するのに要る。
  "ResizeObserver",
  // `lineBoxesOf`（筆先の居場所を行から測る）のテストが
  // 2つセットで要る。`DOMRect` はhappy-dom がレイアウトを持たないので測った値を
  // 名乗らせるのに、`NodeFilter` は文字の節点をたどる `createTreeWalker` に渡すのに使う
  // （借りないと、測る側が例外で落ちたことに気づけないまま「筆先が出ない」だけに見える）。
  "DOMRect",
  "NodeFilter",
  // `sanitizeSvg`（立ち絵の SVG を削ぎ落とす）が、XML として読んで書き戻すのに2つセットで要る。
  "DOMParser",
  "XMLSerializer",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  // `loadSplit` / `saveSplit` 系
  // （利用者の設定を `localStorage` に持つモジュール）のテストが
  // 要る。DOM を組み立てる部品ではないが、他のテスト（`fetch` / `WebSocket` を使うもの）には
  // 影響しない値の保管場所なので、ここに含めてよい。
  "localStorage",
  // `CharacterEdit`（選んだ立ち絵を data URL にする）のテストが要る。
  // 2つセットで借りる — 片方だけ差し替えると `FileReader` が相手の `Blob` を受け取れない。
  "File",
  "FileReader",
] as const

const window = new Window({ url: "http://127.0.0.1/" })

// `globalThis` も happy-dom の `Window` も、動的な名前でのプロパティの読み書きに使える index
// signature を持たない。`Reflect.get` / `Reflect.set` は型を迂回するキャストなしにそれができる。
for (const name of BORROWED_DOM_GLOBAL_NAMES) {
  Reflect.set(globalThis, name, Reflect.get(window, name))
}
Reflect.set(globalThis, "window", window)
Reflect.set(globalThis, "document", window.document)
Reflect.set(globalThis, "navigator", window.navigator)
// React の act() まわりの警告（テスト環境だと自動検出できない）を止める公式の合図。
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

/**
 * テストの中でページの URL を差し替える（ポートを見る部品のため。`roomName` が返す
 * 部屋の名前は、このページを配っているポートから決まる）。
 *
 * ここに置くのは、差し替えの口を持っているのが happy-dom の `Window` だけだから
 * （`globalThis.window` は DOM の型なので、テスト側から触るとキャストが要る）。
 */
export function setPageUrl(url: string): void {
  window.happyDOM.setURL(url)
}
