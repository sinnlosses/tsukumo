import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  requestDiaryBookOpen,
  useDiaryBookOpenRequest,
} from "../../../../../../src/browser/components/page/achievement/hooks/use-diary-book-open-request.ts"

/**
 * 画面をまたいで見開きを開く一回限りの合図。この起動のあいだ持ち続ける
 * モジュールの外の store なので、テストは値そのものよりも「呼ぶたびに変わる」ことを見る。
 */

afterEach(() => {
  cleanup()
})

describe("useDiaryBookOpenRequest", () => {
  it("呼ぶたびに token が増え、購読している hook が拾う", () => {
    const { result } = renderHook(() => useDiaryBookOpenRequest())

    act(() => {
      requestDiaryBookOpen("2026-09-21")
    })
    const first = result.current
    expect(first?.date).toBe("2026-09-21")

    act(() => {
      requestDiaryBookOpen("2026-09-22")
    })
    const second = result.current
    expect(second?.date).toBe("2026-09-22")
    expect(second?.token).toBeGreaterThan(first?.token ?? 0)
  })
})
