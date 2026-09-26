// 画面の木の根（`<Root>`）。`app.tsx` の `<App>` が Provider を重ねた内側でこれを描く。
// **描く前の判断だけを持つ**——サーバと版が合わないときの知らせと、立ち絵の先読み。
// 帯と画面の組み立ては `layout.tsx` の `<Layout>`。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../stores/session.tsx"
import { usePortraitPreload } from "../domain/portrait.tsx"
import { ProtocolMismatch } from "../domain/protocol-mismatch.tsx"
import { Layout } from "./layout.tsx"

export function Root(): ReactElement {
  // 切り替えた先の領域で立ち絵が空かないよう、**どちらの画面を出していても**表情の数だけ
  // 先に読んでおく（docs/screen-design.md 13.7「切り替えのときの立ち絵」）。読み手が
  // キャラビューと雑談ビューの2つにまたがり、会話の画面を出していないときも要るので、入口で
  // 1回だけ呼ぶ。
  usePortraitPreload(useSessionSelector((session) => session.state.character?.portraits))
  // サーバと版が合わない間は、どの画面も描かず知らせだけを出す（docs/design.md 4.4）。
  const protocol = useSessionSelector((session) => session.protocol)
  if (protocol === "mismatched") {
    return <ProtocolMismatch />
  }
  return <Layout />
}
