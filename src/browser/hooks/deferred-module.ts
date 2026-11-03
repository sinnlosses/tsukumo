// 初期読み込みの束から `import()` で外したモジュールを読み、読み込みの状態を zustand の store に持つ口。
// 部品は `useLoadState` で状態を購読し、読み終わっていれば同じ描画でモジュールの中身を使う。
// 購読した部品が描かれると読み始める。`load` を先に呼ぶのは早く読み始めたいときだけで、呼び忘れても読み込み中のまま残らない
// （開発サーバの差し替えでこのモジュールが評価し直されると、状態は新しい store で「読み込み中」から始まる）。
//
// `React.lazy` と `Suspense` に替えない。
// store の更新は同期の lane で描かれ、そこで suspend すると React は fallback をその場で出し、本体への差し替えを `setTimeout` で 300ms 間引く。

import { create } from "zustand"

import { useMountEffect } from "./use-mount-effect.ts"

type DeferredModuleState<Module> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly module: Module }
  | { readonly kind: "failed" }

type DeferredModule<Module> = {
  /**
   * 読み込む。何度呼んでも読み込みは1回。
   * 失敗しても reject せず、読めなかった状態にして返す。
   * 読めなかった状態はページを読み直すまで続く（ブラウザは同じ URL の `import()` の失敗を覚えていて、取り直さない）。
   */
  readonly load: () => Promise<void>
  /** いまの読み込みの状態を購読する。描かれたら読み始める。 */
  readonly useLoadState: () => DeferredModuleState<Module>
}

/** `importModule` は `import()` を1つだけ呼ぶ関数（組み立てがその先をチャンクに分ける）。 */
export function deferredModule<Module>(
  importModule: () => Promise<Module>,
): DeferredModule<Module> {
  const useModuleState = create<DeferredModuleState<Module>>()(() => ({ kind: "loading" }))
  let loading: Promise<void> | undefined = undefined
  const load = (): Promise<void> => {
    loading ??= importModule().then(
      (module) => {
        useModuleState.setState({ kind: "ready", module })
      },
      () => {
        useModuleState.setState({ kind: "failed" })
      },
    )
    return loading
  }

  return {
    load,
    useLoadState: () => {
      useMountEffect(() => {
        void load()
      })
      return useModuleState()
    },
  }
}
