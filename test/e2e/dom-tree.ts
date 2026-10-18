// E2E が判定に使う DOM の木。ページの中で動く台本で構造を写し、落ち着くまで読み直す。
// 残すもの・落とすものの正典は `docs/architecture/testing.md`「E2E の成果物と再現」。

import { writeFileSync } from "node:fs"
import path from "node:path"

import type { Page } from "playwright-core"

import { REPOSITORY_ROOT } from "./artifact.ts"
import { asRecord } from "./message-record.ts"

/** `page` はページ全体（`body` の子）。それ以外は `DOM_ROOT_SELECTORS` の根に当たる要素ごとの写し。 */
export type DomRootName = "page" | keyof typeof DOM_ROOT_SELECTORS

/**
 * DOM の構造を読み、2回続けて同じになるまで読み直す（時計は止めてあるので、残るのは描き直しと
 * 素材の読み込みだけ）。
 * 2回同じでも `aria-busy="true"` の要素が残っている間は落ち着いたと見なさない（取得中の表示は文字が変わらない）。
 * 落ち着かずに投げるときは、最後の2回の読みの差分を `outDir/<scenario>.settle-diff.txt` に残す。
 */
export async function settledDom(page: Page, scenario: string, outDir: string): Promise<void> {
  let previous = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await page.waitForTimeout(SETTLE_INTERVAL_MS)
    // 止めた時計では、取得の結果を画面へ知らせるごく短い setTimeout も眠ったままになる
    // （React Query の通知など。0ms 進めるだけでは起きない回がある）。
    // 取得中の印が残るあいだだけ 1ms 進めて起こす。
    if (await page.evaluate(HAS_BUSY_ELEMENT_SCRIPT)) {
      await page.clock.runFor(1)
    }
    const current = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
    if (current === previous && !(await page.evaluate(HAS_BUSY_ELEMENT_SCRIPT))) {
      return
    }
    if (attempt === SETTLE_ATTEMPTS - 1) {
      const diff = diffDomTrees(JSON.parse(previous), JSON.parse(current))
      const busyHints = await page.evaluate<readonly string[]>(BUSY_ELEMENT_HINTS_SCRIPT)
      const diffPath = path.join(outDir, `${scenario}.settle-diff.txt`)
      writeFileSync(diffPath, `${settleDiffText(diff, busyHints)}\n`, "utf8")
      throw new Error(
        `DOM が落ち着かない（${String(SETTLE_INTERVAL_MS * SETTLE_ATTEMPTS)}ms）。最後の2回の差分: ${path.relative(REPOSITORY_ROOT, diffPath)}\n${diff.slice(0, 5).join("\n")}`,
      )
    }
    previous = current
  }
  throw new Error(`DOM が落ち着かない（${String(SETTLE_INTERVAL_MS * SETTLE_ATTEMPTS)}ms）`)
}

/**
 * `options.domRoots` が選んだ名前ごとに、`DOM_ROOT_SELECTORS` の根に当たる要素（文書順）を写す台本。
 * `page` は `document.body` の子、それ以外は当たった要素ごとの `nodeOf` の結果を並べる
 * （当たらない・隠れていれば空の並び）。
 */
export function namedDomTreeScript(domRoots: readonly DomRootName[]): string {
  return `(() => {
${DOM_TREE_HELPERS_SCRIPT}
  const rootSelectors = ${JSON.stringify(DOM_ROOT_SELECTORS)};
  const domRoots = ${JSON.stringify(domRoots)};
  const result = {};
  for (const name of domRoots) {
    result[name] = name === "page"
      ? childrenOf(document.body)
      : Array.from(document.querySelectorAll(rootSelectors[name])).flatMap((element) => nodeOf(element));
  }
  return result;
})()`
}

/** 部分木の名前から根のセレクタへの表。`class` では当てない（見た目の直しで外れる）。 */
const DOM_ROOT_SELECTORS = {
  "screen-nav": 'nav[aria-label="画面"]',
  main: '[data-region="main"]',
  sidebar: '[data-region="sidebar"]',
  character: '[data-region="character"]',
  dispatch: '[data-region="dispatch"]',
  "work-strip": 'section[aria-label="進み具合"]',
  "turn-outline": 'nav[aria-label="やり取り"]',
  "remembered-lines": 'section[aria-label="覚えていること"]',
  "task-section": 'section[aria-label="タスク"]',
  "task-board": 'dialog[aria-label="タスク"]',
  "task-run-confirm": 'dialog[aria-label="タスクの実行"]',
  "session-switcher": 'dialog[aria-label="セッションを切り替える"]',
} as const satisfies Record<string, string>

/**
 * DOM の構造が落ち着いたと見なすまでの読み直しの間隔と回数。時計を止めたあとは時間で進むものが
 * 無いので、残るのは React の描き直し・素材の読み込みと、`aria-busy` が待つ本物の往復だけ。
 * 往復は時計に依らず、同じ機械で複数の `check` が重なると 5000ms を超えることがあるので、
 * 回数はその3倍にしてある。
 */
const SETTLE_INTERVAL_MS = 100
const SETTLE_ATTEMPTS = 150

/** `settle-diff.txt` の本文。差分に加え、投げた時点で `aria-busy="true"` だった要素の手がかりを残す。 */
function settleDiffText(diff: readonly string[], busyHints: readonly string[]): string {
  const diffText = diff.length === 0 ? "(差分なし。最後の2回のあいだで落ち着いた)" : diff.join("\n")
  const busyText =
    busyHints.length === 0
      ? `aria-busy="true" の要素: (無し)`
      : `aria-busy="true" の要素:\n${busyHints.join("\n")}`
  return `${diffText}\n\n${busyText}`
}

/** 取得中の印と、描き終わっていない mermaid の図（スクリプトの読み込みが遅いと、描く前に落ち着いたと見なしてしまう）。 */
const HAS_BUSY_ELEMENT_SCRIPT = `document.querySelector('[aria-busy="true"], pre.mermaid:not([data-processed])') !== null`

/** 投げた時点で `aria-busy="true"` の各要素を、`aria-label`・役割・タグ名・class のうち分かる手がかりで表す。 */
const BUSY_ELEMENT_HINTS_SCRIPT = `(() => {
  return Array.from(document.querySelectorAll('[aria-busy="true"]')).map((element) => {
    const label = element.getAttribute("aria-label")
    const role = element.getAttribute("role")
    const tag = element.tagName.toLowerCase()
    const className = element.getAttribute("class")
    const hints = [
      label ? \`aria-label="\${label}"\` : undefined,
      role ? \`role="\${role}"\` : undefined,
      \`tag=\${tag}\`,
      className ? \`class="\${className}"\` : undefined,
    ].filter((hint) => hint !== undefined)
    return hints.join(" ")
  })
})()`

/** 差分の1件に出す値の長さの上限と、書き出す件数の上限。 */
const DIFF_VALUE_LENGTH_LIMIT = 80
const DIFF_LINE_LIMIT = 40

/** 2つの DOM の木を葉までのパスで比べ、値が変わった・無くなった・増えたパスを返す。 */
function diffDomTrees(previous: unknown, current: unknown): readonly string[] {
  const previousLeaves = new Map(toLeaves(previous, "$"))
  const currentLeaves = new Map(toLeaves(current, "$"))
  return [...new Set([...previousLeaves.keys(), ...currentLeaves.keys()])]
    .filter((leafPath) => previousLeaves.get(leafPath) !== currentLeaves.get(leafPath))
    .slice(0, DIFF_LINE_LIMIT)
    .map(
      (leafPath) =>
        `${leafPath}: ${truncateForDiff(previousLeaves.get(leafPath))} -> ${truncateForDiff(currentLeaves.get(leafPath))}`,
    )
}

function truncateForDiff(value: string | undefined): string {
  if (value === undefined) {
    return "(無し)"
  }
  return value.length > DIFF_VALUE_LENGTH_LIMIT
    ? `${value.slice(0, DIFF_VALUE_LENGTH_LIMIT)}…`
    : value
}

function toLeaves(value: unknown, atPath: string): readonly (readonly [string, string])[] {
  if (Array.isArray(value)) {
    return value.length === 0
      ? [[atPath, "[]"]]
      : value.flatMap((item, index) => toLeaves(item, `${atPath}[${String(index)}]`))
  }
  if (typeof value === "object" && value !== null) {
    const record = asRecord(value)
    const keys = Object.keys(record)
    return keys.length === 0
      ? [[atPath, "{}"]]
      : keys.flatMap((key) => toLeaves(record[key], `${atPath}.${key}`))
  }
  return [[atPath, JSON.stringify(value)]]
}

/**
 * DOM の木を組む台本の共通部分（ページの中で動く）。残すもの・落とすものは
 * `docs/architecture/testing.md`「E2E の成果物と再現」のとおり。文字列で渡すのは `installFixedClock` と
 * 同じ理由（ページの中のコードで、このファイルの型と lint の対象にしない）。`nodeOf(element)` が
 * 1要素を写す（隠れていれば空の並び）、`childrenOf(element)` がその子を並べる。
 */
const DOM_TREE_HELPERS_SCRIPT = `
  const ID_REFERENCE = new Set([
    "aria-controls", "aria-labelledby", "aria-describedby", "aria-owns",
    "aria-activedescendant", "aria-details", "aria-errormessage", "aria-flowto",
  ]);
  const SKIPPED = new Set(["script", "style", "template", "noscript", "link", "meta"]);
  const OPAQUE = new Set(["svg", "canvas"]);
  const collapse = (text) => text.replace(/\\s+/g, " ").trim();
  const localPath = (value) => {
    const resolved = new URL(value, location.href);
    return resolved.origin === location.origin
      ? resolved.pathname + resolved.search + resolved.hash
      : resolved.href;
  };
  const visible = (element) =>
    getComputedStyle(element).display === "contents" || element.checkVisibility();
  const attributesOf = (element, tag) => {
    const kept = {};
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (name === "role" || name.startsWith("data-") ||
          (name.startsWith("aria-") && !ID_REFERENCE.has(name))) {
        kept[name] = attribute.value;
      }
    }
    if (OPAQUE.has(tag)) {
      for (const name of Object.keys(kept)) {
        if (!name.startsWith("data-")) delete kept[name];
      }
      return kept;
    }
    if (element.hasAttribute("type")) kept.type = element.getAttribute("type");
    if ("disabled" in element && element.disabled === true) kept.disabled = true;
    if (tag === "input" && (element.type === "checkbox" || element.type === "radio")) {
      kept.checked = element.checked;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") kept.value = element.value;
    if ((tag === "details" || tag === "dialog") && element.open) kept.open = true;
    if (element.hasAttribute("href")) kept.href = localPath(element.getAttribute("href"));
    if (tag === "img") {
      kept.alt = element.getAttribute("alt") ?? "";
      if (element.hasAttribute("src")) kept.src = new URL(element.getAttribute("src"), location.href).pathname;
    }
    if (tag === "time" && element.dateTime !== "") kept.dateTime = element.dateTime;
    return kept;
  };
  const childrenOf = (element) => {
    const children = [];
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = collapse(node.textContent ?? "");
        if (text !== "") children.push(text);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        children.push(...nodeOf(node));
      }
    }
    return children;
  };
  // マークダウンエディタ（CodeMirror）は中の行の分け方と自動の class を写さず、文面だけを textarea の value のように残す。
  const editorNodeOf = (element) => {
    const lines = Array.from(element.querySelectorAll(".cm-line"), (line) =>
      Array.from(line.childNodes)
        .filter((node) => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains("cm-placeholder")))
        .map((node) => node.textContent ?? "")
        .join(""),
    );
    return [{ tag: element.localName, attributes: { editor: "codemirror", value: lines.join("\\n") } }];
  };
  const nodeOf = (element) => {
    const tag = element.localName;
    if (SKIPPED.has(tag) || !visible(element)) return [];
    if (element.classList.contains("cm-editor")) return editorNodeOf(element);
    const attributes = attributesOf(element, tag);
    const children = OPAQUE.has(tag) || tag === "textarea" ? [] : childrenOf(element);
    if ((tag === "div" || tag === "span") && Object.keys(attributes).length === 0) {
      return children;
    }
    const node = { tag };
    if (Object.keys(attributes).length > 0) node.attributes = attributes;
    if (children.length > 0) node.children = children;
    return [node];
  };
`

/** ページ全体（`document.body` の子）を写す台本。落ち着いたかどうかの判定にも使う（範囲を絞らない）。 */
const DOM_TREE_SCRIPT = `(() => {
${DOM_TREE_HELPERS_SCRIPT}
  return childrenOf(document.body);
})()`
