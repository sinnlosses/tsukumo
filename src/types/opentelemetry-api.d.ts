// `@opentelemetry/api` の型の代役。**tsukumo は入れていない**（oRPC の任意の peer 依存で、実行時には
// 読まれない）が、`@orpc/shared` の型宣言がここから型だけを import しているので、無いと `tsc` が
// 型宣言の中で落ちる。`skipLibCheck` で型宣言の検査ごと止めずに済ませるため、**`@orpc/shared` が
// 名指ししている名前だけ**を中身の無い型で置く（oRPC を上げて名前が増えたら `tsc` が落ちて知らせる）。
// 経緯は `docs/research/external-dependency.md` の表1の oRPC の行。
//
// 置き場は `src/types/`（どの層にも属さない ambient 宣言で、サーバとブラウザの両方の型が辿る）。

declare module "@opentelemetry/api" {
  export type Tracer = unknown
  export type TraceAPI = unknown
  export type ContextAPI = unknown
  export type PropagationAPI = unknown
  // `interface RunWithSpanOptions extends SpanOptions` があるので、中身の分かる object 型にする。
  export type SpanOptions = Record<never, never>
  export type Context = unknown
  export type Span = unknown
  export type AttributeValue = unknown
  export type Exception = unknown
}
