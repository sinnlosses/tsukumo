import { beforeEach, describe, expect, it } from "vitest"

import {
  favorBandShown,
  useFavorVisibility,
} from "../../../../../../src/browser/components/page/conversation/stores/favor-visibility.ts"

describe("favorBandShown", () => {
  beforeEach(() => {
    useFavorVisibility.setState({ favorId: undefined, visible: false, dismissedId: undefined })
  })

  it("お願いがあり見えていないと出す", () => {
    useFavorVisibility.getState().attach("favor-a")
    expect(favorBandShown(useFavorVisibility.getState())).toBe(true)
  })

  it("見えていると出さない", () => {
    useFavorVisibility.getState().attach("favor-a")
    useFavorVisibility.getState().setVisible(true)
    expect(favorBandShown(useFavorVisibility.getState())).toBe(false)
  })

  it("お願いが無いと出さない", () => {
    expect(favorBandShown(useFavorVisibility.getState())).toBe(false)
  })

  it("依頼を送ったあとは同じお願いで出さず、新しいお願いで出す", () => {
    const store = useFavorVisibility.getState()
    store.attach("favor-a")
    store.dismiss()
    expect(favorBandShown(useFavorVisibility.getState())).toBe(false)
    useFavorVisibility.getState().attach("favor-b")
    expect(favorBandShown(useFavorVisibility.getState())).toBe(true)
  })

  it("detach でお願いなしに戻る", () => {
    useFavorVisibility.getState().attach("favor-a")
    useFavorVisibility.getState().detach()
    expect(useFavorVisibility.getState().favorId).toBeUndefined()
  })
})
