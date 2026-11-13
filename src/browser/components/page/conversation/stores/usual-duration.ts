// 「いつもは」の所要（段の群ごと・待ちの種類ごと）を持つ store と、それを読むフック。
// ターンが始まるたび（依頼を送るたびを含む）に1回取り直す。読む部品が幾つあっても、同じターンでは1回しか取りに行かない。
// 取れなかった・取る前は件数 0 の値に倒し、例外にしない。
// 合図は記録の数でなく `nextTurnId` にする（記録は集計期間で切り詰められ、数が増えなくなる）。

import { create } from "zustand"

import {
  NO_USUAL_DURATIONS,
  type UsualDurations,
} from "../../../../../shared/usage/usual-duration.ts"
import { useExternalSync } from "../../../../hooks/use-external-sync.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useSession } from "../../../../stores/session.ts"

type UsualDurationState = {
  readonly usual: UsualDurations
  /** 取りに行った最後のターンの通し番号。取りに行く前は `none`。 */
  readonly requested: { readonly kind: "none" } | { readonly kind: "turn"; readonly id: number }
}

const useUsualDurationStore = create<UsualDurationState>()(() => ({
  usual: NO_USUAL_DURATIONS,
  requested: { kind: "none" },
}))

export function useUsualDurations(): UsualDurations {
  const turnId = useSession((session) => session.state.nextTurnId)
  useExternalSync(() => {
    const { requested } = useUsualDurationStore.getState()
    if (requested.kind === "turn" && requested.id === turnId) {
      return
    }
    useUsualDurationStore.setState({ requested: { kind: "turn", id: turnId } })
    rpc.usualDuration.usualDurations.call(undefined).then(
      (usual) => {
        useUsualDurationStore.setState({ usual })
      },
      // 取れなかった回は前の値のまま（はじめは件数 0）にする。
      () => undefined,
    )
  }, [turnId])
  return useUsualDurationStore((state) => state.usual)
}
