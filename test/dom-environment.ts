// `bun run check` の `bun test` の前に1回だけ読まれる（`bunfig.toml` の `preload`）。
// `src/browser/` の部品テスト（`@testing-library/react`）が要る DOM のグローバルを用意する。
//
// **`happy-dom` の `Window` が持つ全部を `globalThis` へコピーしない。** `fetch` / `WebSocket` /
// `setTimeout` / `console` まで happy-dom のものに差し替わると、実際の HTTP・WebSocket を使う
// 他のテスト（`test/server/adapter/server.test.ts` など）が巻き添えになる。**DOM を組み立てる部品だけを
// 借りる。**（`bun test --isolate` でテストファイルごとにプロセスが分かれるようになった今も、
// 1ファイルの中では同じ `globalThis` を共有するので、借りる範囲は絞ったままにする。
// `--isolate` を付けている理由は `package.json` と `test/browser/features/main-view/report.test.tsx`）
//
// `@happy-dom/global-registrator`（this 一式を1関数でやってくれる別パッケージ）は使わない
// （`docs/design.md` 11章の依存一覧に無い。ここは持ってきた `happy-dom` だけで済ませる）。

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
  "Event",
  "CustomEvent",
  "UIEvent",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "FocusEvent",
  "MutationObserver",
  // `src/browser/features/main-view/report-reveal.ts`（筆先の居場所を行から測る）のテストが
  // **2つセットで**要る。`DOMRect` は**happy-dom がレイアウトを持たない**ので測った値を
  // 名乗らせるのに、`NodeFilter` は文字の節点をたどる `createTreeWalker` に渡すのに使う
  // （借りないと、測る側が例外で落ちたことに気づけないまま「筆先が出ない」だけに見える）。
  "DOMRect",
  "NodeFilter",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  // `src/browser/features/layout/split.ts` 系（利用者の設定を `localStorage` に持つモジュール）のテストが
  // 要る。DOM を組み立てる部品ではないが、他のテスト（`fetch` / `WebSocket` を使うもの）には
  // 影響しない値の保管場所なので、ここに含めてよい。
  "localStorage",
  // `src/browser/features/character-screen/character-edit.tsx`（選んだ立ち絵を data URL にする）のテストが要る。
  // **2つセットで借りる** — 片方だけ差し替えると `FileReader` が相手の `Blob` を受け取れない。
  "File",
  "FileReader",
] as const

const window = new Window({ url: "http://127.0.0.1/" })
const target = globalThis as unknown as Record<string, unknown>
const windowRecord = window as unknown as Record<string, unknown>

for (const name of BORROWED_DOM_GLOBAL_NAMES) {
  target[name] = windowRecord[name]
}
target["window"] = window
target["document"] = window.document
target["navigator"] = window.navigator
// React の act() まわりの警告（テスト環境だと自動検出できない）を止める公式の合図。
target["IS_REACT_ACT_ENVIRONMENT"] = true
