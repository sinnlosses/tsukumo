// 画面の木の根（`<Root>`）。Provider の内側で描かれる。
// 描く前のことだけを持つ。サーバとの接続、パックの見た目、サーバと版が合わないときの知らせと、立ち絵の先読み。
// 帯と画面の組み立ては `<Layout>`。

import type { ReactElement } from "react"

import { useSession, useSessionConnection } from "../../stores/session.ts"
import { usePortraitPreload } from "../domain/portrait.tsx"
import { ProtocolMismatch } from "../domain/protocol-mismatch.tsx"
import { Layout } from "./layout.tsx"
import { usePackAppearance } from "./pack-appearance.ts"

export function Root(): ReactElement {
  useSessionConnection()
  usePackAppearance()
  // 切り替えた先の領域で立ち絵が空かないよう、どちらの画面を出していても表情の数だけ先に読んでおく。
  // 読み手がキャラビューと雑談ビューの2つにまたがり、会話の画面を出していないときも要るので、入口で1回だけ呼ぶ。
  usePortraitPreload(useSession((session) => session.state.character?.portraits))
  // サーバと版が合わない間は、どの画面も描かず知らせだけを出す。
  const protocol = useSession((session) => session.protocol)
  if (protocol === "mismatched") {
    return <ProtocolMismatch />
  }
  return <Layout />
}
