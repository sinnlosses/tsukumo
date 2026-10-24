// 交差を通知できる IntersectionObserver の偽物。happy-dom の本物は交差を計算せず、通知が来ない。
// `visible: true` なら観測を始めた時点で交差を通知する。false なら `intersect()` を呼ぶまで通知しない。

import { vi } from "vitest"

type Entry = { readonly target: Element; readonly isIntersecting: boolean }

type Callback = (entries: Entry[]) => void

type Fake = {
  readonly callback: Callback
  readonly targets: Set<Element>
  readonly options: IntersectionObserverInit
  readonly disconnect: ReturnType<typeof vi.fn<() => void>>
}

export type FakeIntersection = {
  readonly instances: readonly Fake[]
  /** 観測中の要素すべてに交差を通知する。 */
  readonly intersect: () => void
}

export function stubIntersectionObserver(visible: boolean): FakeIntersection {
  const instances: Fake[] = []

  const entryOf = (target: Element, isIntersecting: boolean): Entry => ({
    target,
    isIntersecting,
  })

  class FakeObserver {
    private readonly fake: Fake

    constructor(callback: Callback, options?: IntersectionObserverInit) {
      this.fake = {
        callback,
        targets: new Set(),
        options: options ?? {},
        disconnect: vi.fn<() => void>(() => {
          this.fake.targets.clear()
        }),
      }
      instances.push(this.fake)
    }

    observe(target: Element): void {
      this.fake.targets.add(target)
      if (visible) {
        this.fake.callback([entryOf(target, true)])
      }
    }

    unobserve(target: Element): void {
      this.fake.targets.delete(target)
    }

    disconnect(): void {
      this.fake.disconnect()
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeObserver)

  return {
    instances,
    intersect: () => {
      for (const fake of instances) {
        const entries = [...fake.targets].map((target) => entryOf(target, true))
        if (entries.length > 0) {
          fake.callback(entries)
        }
      }
    },
  }
}
