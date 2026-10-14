import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  usePhasePopover,
  type PhasePopover,
  type PhasePopoverScope,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-phase-popover.ts"

afterEach(() => {
  cleanup()
})

const SHOWN = { kind: "shown", exchange: 1, keys: ["0", "1"] } as const satisfies PhasePopoverScope

/** `SHOWN` で丸 "0" を開き、`away` を通ってから `SHOWN` へ戻したあとの開いた丸。 */
function openKeyAfterRoundTrip(away: PhasePopoverScope): string | undefined {
  const { result, rerender } = renderHook<PhasePopover, PhasePopoverScope>(
    (scope) => usePhasePopover(scope),
    { initialProps: SHOWN },
  )
  act(() => result.current.toggle("0"))
  expect(result.current.openKey).toBe("0")

  rerender(away)
  expect(result.current.openKey).toBeUndefined()
  rerender(SHOWN)
  return result.current.openKey
}

describe("usePhasePopover", () => {
  it("帯が消えたあと同じやり取りで戻っても、吹き出しは閉じたまま", () => {
    expect(openKeyAfterRoundTrip({ kind: "hidden" })).toBeUndefined()
  })

  it("やり取りが替わったあと元のやり取りに戻っても、吹き出しは閉じたまま", () => {
    expect(openKeyAfterRoundTrip({ ...SHOWN, exchange: 2 })).toBeUndefined()
  })

  it("開いた丸が並びから消えたあと戻っても、吹き出しは閉じたまま", () => {
    expect(openKeyAfterRoundTrip({ ...SHOWN, keys: ["1"] })).toBeUndefined()
  })
})
