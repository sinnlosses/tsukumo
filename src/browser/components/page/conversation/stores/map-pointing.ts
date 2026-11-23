// 会話で届いた `{{map: <ID>}}` の箱を、地図の選びに載せる。
// 姿が進んで新しく指された箱があったときだけ、最後の1つを選ぶ。雑談と、会話が替わった回は何もしない。
// 読み込まれたときに購読を始める（会話の画面が1回だけ import する）。

import { resolveMapBox } from "../../../../features/architecture-map/map-box-lookup.ts"
import { pointToBox } from "../../../../features/architecture-map/point-box.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import { pointedBoxIdsBetween } from "../domain/map-pointing.ts"

useSession.subscribe((next, previous) => {
  if (
    next.state === previous.state ||
    next.generation !== previous.generation ||
    next.state.chatMode
  ) {
    return
  }
  const last = pointedBoxIdsBetween(previous.state, next.state).at(-1)
  if (last !== undefined) {
    void pointAt(last)
  }
})

async function pointAt(id: string): Promise<void> {
  try {
    const index = await rpc.architectureMap.boxes.call()
    if (index.kind !== "ready") {
      return
    }
    const lookup = resolveMapBox(index.boxes, id)
    if (lookup.kind === "found") {
      await pointToBox(lookup.box)
    }
  } catch {
    // 地図を引けなかったときは何も選ばない
  }
}
