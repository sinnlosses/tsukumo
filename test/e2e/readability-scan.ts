import type { Page } from "playwright-core"

// 会話の画面の押せるもの・字を走査して、寸法・名前・字の大きさ・コントラストの下限を割るものを返す。
// キャラクターの領域は背景画像の上の字なので走査しない。

export type ReadabilityReport = {
  readonly smallTargets: readonly string[]
  readonly unnamedControls: readonly string[]
  readonly smallText: readonly string[]
  readonly lowContrastText: readonly string[]
}

export async function scanReadability(page: Page): Promise<ReadabilityReport> {
  // 時計を止めてあるので、色の遷移が途中のまま止まり、遷移の途中の色を測ってしまう。
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  })
  return page.evaluate(() => {
    const ROOTS =
      '[data-region="main"], [data-region="sidebar"], [data-region="dispatch"], nav[aria-label="画面"], dialog[open]'
    const TARGETS =
      'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"]'
    const MIN_TARGET = 23.95
    const MIN_FONT = 12
    const MIN_CONTRAST = 4.5

    type Rgba = { r: number; g: number; b: number; a: number }
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (context === null) {
      throw new Error("canvas が使えない")
    }
    const parse = (color: string): Rgba => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = "#000"
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const data = context.getImageData(0, 0, 1, 1).data
      return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0, a: (data[3] ?? 0) / 255 }
    }
    const over = (front: Rgba, back: Rgba): Rgba => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    })
    const luminance = (color: Rgba): number => {
      const channel = (value: number): number => {
        const ratio = value / 255
        return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    }

    const roots = [...document.querySelectorAll(ROOTS)]
    const inScope = (element: Element): boolean => roots.some((root) => root.contains(element))
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      )
    }
    const describe = (element: Element): string => {
      const text = (
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        element.textContent ??
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 24)
      return `<${element.tagName.toLowerCase()}> "${text}"`
    }
    const size = (rect: DOMRect): string =>
      `${(Math.round(rect.width * 10) / 10).toString()}x${(Math.round(rect.height * 10) / 10).toString()}`

    const smallTargets: string[] = []
    const unnamedControls: string[] = []
    for (const element of document.querySelectorAll(TARGETS)) {
      if (!inScope(element) || !visible(element)) {
        continue
      }
      if (element.closest("select") !== null && element.tagName !== "SELECT") {
        continue
      }
      const inlineInSentence =
        (element.tagName === "A" || element.getAttribute("role") === "button") &&
        getComputedStyle(element).display === "inline"
      if (inlineInSentence) {
        continue
      }
      const labels = element instanceof HTMLInputElement ? [...(element.labels ?? [])] : []
      const box = labels[0] ?? element
      const rect = box.getBoundingClientRect()
      if (rect.width < MIN_TARGET || rect.height < MIN_TARGET) {
        smallTargets.push(`${size(rect)} ${describe(element)}`)
      }
      const named =
        (element.textContent ?? "").trim() !== "" ||
        element.getAttribute("aria-label") !== null ||
        element.getAttribute("title") !== null ||
        labels.length > 0
      if (!named) {
        unnamedControls.push(describe(element))
      }
    }

    const backgroundOf = (element: Element): Rgba | undefined => {
      const chain: Element[] = []
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        chain.push(node)
      }
      let background: Rgba = { r: 255, g: 255, b: 255, a: 1 }
      for (const node of chain.reverse()) {
        const style = getComputedStyle(node)
        if (style.backgroundImage !== "none") {
          return undefined
        }
        const color = parse(style.backgroundColor)
        if (color.a > 0) {
          background = over(color, background)
        }
      }
      return background
    }
    const opacityOf = (element: Element): number => {
      let opacity = 1
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        opacity *= Number.parseFloat(getComputedStyle(node).opacity)
      }
      return opacity
    }

    const smallText = new Set<string>()
    const lowContrastText = new Set<string>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim()
      const element = node.parentElement
      if (text === "" || element === null || !inScope(element) || !visible(element)) {
        continue
      }
      if (element.closest("script, style, canvas, svg") !== null) {
        continue
      }
      const label = `${describe(element)} "${text.slice(0, 12)}"`
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
      if (fontSize < MIN_FONT) {
        smallText.add(`${fontSize.toString()}px ${label}`)
      }
      if (element.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"]') !== null) {
        continue
      }
      const background = backgroundOf(element)
      if (background === undefined) {
        continue
      }
      const front = parse(getComputedStyle(element).color)
      front.a *= opacityOf(element)
      const a = luminance(over(front, background))
      const b = luminance(background)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < MIN_CONTRAST) {
        lowContrastText.add(`${(Math.round(ratio * 100) / 100).toString()}:1 ${label}`)
      }
    }

    return {
      smallTargets,
      unnamedControls,
      smallText: [...smallText],
      lowContrastText: [...lowContrastText],
    }
  })
}
