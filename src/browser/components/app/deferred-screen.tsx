// 会話の画面以外の画面を、初期読み込みの束から `import()` で外して読む口。
// 画面を開いた（マウントした）ときに読み始め、読み終わるまでは高さを持たない空の器に `aria-busy="true"` を出す。
// 読めなかったときは描画の失敗として投げ、`<ScreenBoundary>` の「読み込み直す」を出させる。

import { useEffect, type ComponentType, type ReactElement } from "react"

import { deferredModule } from "../../hooks/deferred-module.ts"

/** `importScreen` は `import()` を1つだけ呼んで、画面の部品を返す関数。 */
export function deferredScreen(importScreen: () => Promise<ComponentType>): ComponentType {
  const screenModule = deferredModule(importScreen)

  return function DeferredScreen(): ReactElement {
    const state = screenModule.useLoadState()
    useEffect(() => {
      void screenModule.load()
    }, [])
    switch (state.kind) {
      case "loading":
        return <div aria-busy="true" />
      case "failed":
        throw new Error("画面のモジュールを読み込めなかった")
      case "ready":
        return <state.module />
    }
  }
}
