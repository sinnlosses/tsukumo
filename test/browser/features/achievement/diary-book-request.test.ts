import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"

import {
  requestDiaryBookOpen,
  useDiaryBookOpenRequest,
} from "../../../../src/browser/features/achievement/diary-book-request.ts"

/**
 * 画面をまたいで見開きを開く一回限りの合図（`useSyncExternalStore`）。この起動のあいだ持ち続ける
 * モジュールの外の store なので、テストは値そのものよりも「呼ぶたびに変わる」ことを見る。
 */

afterEach(() => {
  cleanup()
})

describe("useDiaryBookOpenRequest", () => {
  it("まだ一度も呼ばれていなければ undefined", () => {
    // このテストファイルの中で他のテストより先に走らない保証は無いので、`token` の値ではなく
    // 「呼ぶ前後で日付が変わる」ことだけを見る。
    const { result } = renderHook(() => useDiaryBookOpenRequest())
    const before = result.current

    act(() => {
      requestDiaryBookOpen("2026-09-20")
    })

    expect(result.current).not.toBe(before)
    expect(result.current?.date).toBe("2026-09-20")
  })

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
