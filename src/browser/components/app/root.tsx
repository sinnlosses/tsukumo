// 画面の木の根（`<Root>`）。`app.tsx` の `<App>` が Provider を重ねた内側でこれを描く。
// 描く前のことだけを持つ——サーバとの接続、パックの見た目、サーバと版が合わないときの知らせと、立ち絵の先読み。
// 帯と画面の組み立ては `layout.tsx` の `<Layout>`。

import type { ReactElement } from "react"

import { useSession, useSessionConnection } from "../../stores/session.ts"
import { usePortraitPreload } from "../domain/portrait.tsx"
import { ProtocolMismatch } from "../domain/protocol-mismatch.tsx"
import { Layout } from "./layout.tsx"
import { usePackAppearance } from "./pack-appearance.ts"

export function Root(): ReactElement {
  useSessionConnection()
  usePackAppearance()
  // 切り替えた先の領域で立ち絵が空かないよう、どちらの画面を出していても表情の数だけ
  // 先に読んでおく（docs/screen-design.md 13.7「切り替えのときの立ち絵」）。読み手が
  // キャラビューと雑談ビューの2つにまたがり、会話の画面を出していないときも要るので、入口で
  // 1回だけ呼ぶ。
  usePortraitPreload(useSession((session) => session.state.character?.portraits))
  // サーバと版が合わない間は、どの画面も描かず知らせだけを出す（docs/design.md 4.4）。
  const protocol = useSession((session) => session.protocol)
  if (protocol === "mismatched") {
    return <ProtocolMismatch />
  }
  return <Layout />
}
