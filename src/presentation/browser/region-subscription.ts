// ブラウザの中で動く、領域1つぶんの Server-Sent Events 購読。
//
// **ここは `src/` の他のファイルと実行場所が違う。** サーバ（Bun）ではなくブラウザで動くので、
// `node:` の API もサーバ側の型も使えない。代わりに `document` や `EventSource` が使える
// （型は `@types/bun` が持っている）。`src/presentation/browser/` に置いたものは `bun build` で1本に
// まとめられ、`/assets/` から配られる（`src/index.ts` の起動処理と `src/view-server.ts`）。
//
// **文字列ではなく本物の TypeScript なので、`tsc` と `oxlint` が届く。** これがこのファイルが
// 存在する理由で、以前は `src/presentation/view.ts` のテンプレート文字列の中にあって検査が素通りしていた
// （`docs/architecture.md`「描画にフレームワークを入れず、morph とビルド1段で足りないところを
// 埋める」）。

/**
 * 購読する領域を示す属性。**サーバ側（`src/presentation/view.ts` の `layoutRegionId`）が付ける**もので、
 * 値はイベントの経路（`/events/main` など）そのもの。要素の id ではなく属性で渡すのは、
 * 「どの領域を購読するか」の一覧をブラウザ側に持たずに済ませるため。
 */
const REGION_EVENT_PATH_ATTRIBUTE = "data-event-path"

/** 追従とみなす、いちばん下からの距離（px）。 */
const FOLLOW_THRESHOLD_PX = 24

/**
 * `data-event-path` を持つ要素をすべて購読する。**ページに1回だけ呼ぶ**
 * （呼ぶのは入口の `src/presentation/browser/main.ts`。ここは仕組みだけを持ち、import しただけでは
 * ページを触らない＝テストから素直に呼べる）。
 */
export function subscribeAllRegions(): void {
  const regions = document.querySelectorAll(`[${REGION_EVENT_PATH_ATTRIBUTE}]`)
  for (const region of regions) {
    const eventPath = region.getAttribute(REGION_EVENT_PATH_ATTRIBUTE)
    if (eventPath !== null && eventPath !== "") {
      subscribeRegion(region, eventPath)
    }
  }
}

/**
 * 領域1つを購読し、届いた本文を morph で当てる。
 *
 * - **本文が前回と同じなら何もしない。** 見た目が変わらない push が更新の大半を占めるため
 *   （実機での目視 2026-09-10）。初期値は**いまページに出ている本文**で、サーバが最初に押す
 *   本文と同じなので、開いた直後の1回目がここで弾かれる
 * - **差し替えは Idiomorph の morph。** 一致した要素は DOM に残るので、領域の内側の
 *   スクロール位置・`<details>` の開閉・フォーカスが保たれる（`docs/architecture.md`
 *   「ビューの更新は Server-Sent Events で押す」）
 * - **いちばん下を見ていたときだけ追従する。** morph は元の位置を保つだけなので、
 *   伸びていくレポートを読み続けるにはこの1つだけ自前で要る
 */
export function subscribeRegion(element: Element, eventPath: string): void {
  let lastBody = element.innerHTML
  const source = new EventSource(eventPath)

  source.addEventListener("update", (event: MessageEvent<string>) => {
    if (event.data === lastBody) {
      return
    }

    const scroller = scrollerFor(element)
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const wasNearBottom = distanceFromBottom < FOLLOW_THRESHOLD_PX

    window.Idiomorph.morph(element, event.data, { morphStyle: "innerHTML" })
    lastBody = event.data

    if (wasNearBottom) {
      scroller.scrollTop = scroller.scrollHeight
    }
  })
}

/**
 * スクロールしている要素。領域自身が縦にあふれていれば（`.layout-region` は
 * `overflow-y: auto`）その要素、そうでなければ文書側。
 */
function scrollerFor(element: Element): Element {
  if (element.scrollHeight > element.clientHeight) {
    return element
  }
  return document.scrollingElement ?? document.documentElement
}
