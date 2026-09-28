// `@babel/core` の型の代役。
// ビルド設定が import する `@rolldown/plugin-babel` の型宣言は babel 8 の名前（`InputOptions`・`PresetItem`・`PluginObject`・`FileResult`）を参照するが、`@types/babel__core` は 7 系の名前しか持たず、`skipLibCheck` を外すと `tsc` がここで落ちる。
// babel 8 に上げて `@types/babel__core` がこれらの名前を持つようになったら、このファイルごと消す。

import type {
  TransformOptions,
  PluginObj,
  PluginPass,
  PluginItem,
  BabelFileResult,
} from "@babel/core"

declare module "@babel/core" {
  export type InputOptions = TransformOptions
  export type PresetItem = PluginItem
  export type PluginObject<T = PluginPass> = PluginObj<T>
  export type FileResult = BabelFileResult
}
