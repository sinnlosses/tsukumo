import { afterEach, describe, expect, it } from "vitest"

import {
  loadComposerMode,
  saveComposerMode,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/domain/composer-mode.ts"

const STORAGE_KEY = "tsukumo-composer-mode:v1"

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

describe("loadComposerMode", () => {
  it("何も保存していなければ素の <textarea> を返す", () => {
    expect(loadComposerMode()).toBe("plain")
  })

  it("保存したモードを読み戻す", () => {
    saveComposerMode("markdown")
    expect(loadComposerMode()).toBe("markdown")
    saveComposerMode("plain")
    expect(loadComposerMode()).toBe("plain")
  })

  it("知らない値は素の <textarea> へ畳む", () => {
    localStorage.setItem(STORAGE_KEY, "wysiwyg")
    expect(loadComposerMode()).toBe("plain")
  })
})
