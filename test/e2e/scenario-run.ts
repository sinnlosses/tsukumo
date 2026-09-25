// E2E の足場。**起こす・開く・成果物を書く・比べる・後始末**をここに置き、シナリオ
// （`test/e2e/<シナリオ>.test.ts`）はここを呼ぶだけにする。形の正典は `docs/design.md` 10章
// 「E2E の走らせ方」「E2E の成果物と再現」。
//
// - ブラウザは1ファイルに1つ（`beforeAll`）、tsukumo とブラウザのコンテキストは1件ごとに1つ
// - 起こした tsukumo は `afterEach` で**自分の pid だけ**に `SIGTERM` を送り、終わるのを待ってから
//   一時のディレクトリを消す
// - 判定は DOM の構造とメッセージの列の2つの JSON だけ。スクリーンショットは目視の添え物
//
// 成果物に入るのは疑似セッション（`test/fixture/fake-session.json`）の手書きの会話だけ
// （docs/coding-standards.md「会話内容の扱い」）。起動トークンと絶対パスは置き換えてから書く。

import { afterAll, afterEach, beforeAll, expect } from "bun:test"
import { type ChildProcess, spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Browser, chromium, type Page } from "playwright-core"

/** サーバとブラウザの時計を凍らせる瞬間（走らせる日に依らない固定の値）。 */
const FIXED_INSTANT = "2026-01-15T01:00:00Z"

/** 両側のタイムゾーン（サーバは子プロセスの `TZ`、ブラウザはコンテキストの `timezoneId`）。 */
const TIME_ZONE = "Asia/Tokyo"

/** 走らせた結果とスクリーンショットの置き場（リポジトリの外。毎回書き直す）。 */
const OUTPUT_ROOT = "/tmp/tsukumo-e2e"

/** 期待値の置き場（リポジトリに入れる）。 */
const EXPECTED_ROOT = fileURLToPath(new URL("./expected", import.meta.url))

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 15_000

/** 狙ったイベントが届くまで待つ上限（ミリ秒）。場面の長さ（20 秒まで）に余裕を持たせる。 */
const EVENT_TIMEOUT_MS = 30_000

/**
 * DOM の構造が落ち着いたと見なすまでの読み直しの間隔と回数。時計を止めたあとは時間で進むものが
 * 無いので、残るのは React の描き直しと素材の読み込みだけ。
 */
const SETTLE_INTERVAL_MS = 100
const SETTLE_ATTEMPTS = 50

/** 期待値を書き直すか（`bun run test:e2e:update`）。 */
const UPDATE_EXPECTED = process.env["E2E_UPDATE"] === "1"

/**
 * 窓の大きさ。広いほうは `scripts/capture-catalog.ts` の広い窓と同じ。狭い窓の積み替えを見る
 * シナリオだけ `narrow` を使う。
 */
const VIEWPORTS = {
  wide: { width: 1400, height: 900 },
  narrow: { width: 720, height: 900 },
} as const satisfies Record<string, { readonly width: number; readonly height: number }>

export type ScenarioOptions = {
  /** 成果物と期待値のファイル名（`<シナリオ>.dom.json` など）。 */
  readonly scenario: string
  /** 疑似セッションの場面の名前（`TSUKUMO_FAKE_SCENE`）。名指ししないときは `none`。 */
  readonly scene: string
  readonly viewport: keyof typeof VIEWPORTS
}

/** 起こして開いた1件。シナリオはこれに対して待ち・操作・判定を行う。 */
export type ScenarioRoom = {
  readonly page: Page
  /**
   * 起こした tsukumo の cwd（`realpath` を通した絶対パス）。**`main` の develop/task/ を読む
   * タスクの一覧のように、疑似セッションの場面ではなく cwd の中身そのものが元になるシナリオ**
   * だけがここへ書き足す（`git init` など）。書き足すのはブラウザが繋がったのを確かめたあと
   * にする——起こす前や繋がる前に用意すると、最初の見回りが `hello` に畳まれてしまい、
   * 変化を捕まえる `waitForEvent` の的が無くなる（docs/design.md 10章「E2E の走らせ方」）。
   */
  readonly cwd: string
  /**
   * WebSocket で `kind` のイベントが `occurrence` 回目（既定1回目）届くまで待つ（場面が流れ
   * 終わるのを時間で待たない）。同じ `kind` が場面の中で複数回流れる場合（`turn-finished` が
   * 続きのターンのたびに来るなど）に、狙った回目まで進める口。
   */
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
  /**
   * ブラウザの時計を「凍らせた瞬間 + `elapsedMs`」で止め、DOM が落ち着くのを待ってから
   * 成果物を書き、期待値と比べる（期待値が無ければ落とす。`E2E_UPDATE=1` なら書き直す）。
   */
  readonly settleAndMatch: (elapsedMs: number) => Promise<void>
}

export type ScenarioRun = {
  readonly open: (options: ScenarioOptions) => Promise<ScenarioRoom>
}

/**
 * シナリオのファイルの先頭で1回呼ぶ。ブラウザを起こす・閉じる、1件ごとの後始末を登録する。
 */
export function useScenarioRun(): ScenarioRun {
  let browser: Browser | undefined = undefined
  const cleanups: (() => Promise<void>)[] = []

  beforeAll(async () => {
    browser = await launchChrome()
  })

  afterEach(async () => {
    // 後から起こしたものから閉じる（コンテキスト → tsukumo → 一時のディレクトリ）。
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup()
    }
  })

  afterAll(async () => {
    await browser?.close()
  })

  return {
    open: async (options) => {
      if (browser === undefined) {
        throw new Error("ブラウザが起きていない（beforeAll が走っていない）")
      }
      return openRoom(browser, options, (cleanup) => cleanups.push(cleanup))
    },
  }
}

async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error)
    throw new Error(
      `E2E には手元の Chrome が要る（playwright-core の channel "chrome" で起こせなかった）: ${String(reason)}`,
      { cause: error },
    )
  }
}

async function openRoom(
  browser: Browser,
  options: ScenarioOptions,
  addCleanup: (cleanup: () => Promise<void>) => void,
): Promise<ScenarioRoom> {
  const home = makeTempDirectory("tsukumo-e2e-home-")
  const cwd = makeTempDirectory("tsukumo-e2e-cwd-")
  addCleanup(() => {
    rmSync(home.real, { recursive: true, force: true })
    rmSync(cwd.real, { recursive: true, force: true })
    return Promise.resolve()
  })

  const child = spawnTsukumo(options.scene, home.real, cwd.real)
  addCleanup(() => stopTsukumo(child))
  const viewUrl = await waitForViewUrl(child)
  const url = new URL(viewUrl)

  const context = await browser.newContext({
    viewport: VIEWPORTS[options.viewport],
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: TIME_ZONE,
    reducedMotion: "reduce",
  })
  addCleanup(() => context.close())
  const page = await context.newPage()
  await installFixedClock(page)

  const messages = recordMessages(page)
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" })

  const replacements: readonly (readonly [string, string])[] = [
    // 長いものから置き換える（一時のディレクトリは互いの前置きにならないが、根は短い）。
    ...[home, cwd].flatMap((dir) => [
      [dir.real, dir === home ? "<home>" : "<cwd>"] as const,
      [dir.given, dir === home ? "<home>" : "<cwd>"] as const,
    ]),
    [REPOSITORY_ROOT, "<root>"],
    [url.searchParams.get("t") ?? "<no-token>", "<token>"],
    // ポートは `ホスト:ポート` と、ポートだけの文字（帯に出る部屋の名前）の形でだけ置き換える
    // （数字だけで当てると本文の数に当たりうる）。
    [url.host, `${url.hostname}:<port>`],
    [`"${url.port}"`, '"<port>"'],
  ]

  return {
    page,
    cwd: cwd.real,
    waitForEvent: (kind, occurrence) => messages.waitForEvent(kind, occurrence),
    settleAndMatch: async (elapsedMs) => {
      await page.clock.pauseAt(Temporal.Instant.from(FIXED_INSTANT).epochMilliseconds + elapsedMs)
      const dom = await settledDom(page)
      const outDir = path.join(OUTPUT_ROOT, options.scenario)
      mkdirSync(outDir, { recursive: true })
      await page.screenshot({ path: path.join(outDir, `${options.scenario}.png`) })
      matchArtifact(options.scenario, "dom", dom, replacements, outDir)
      matchArtifact(options.scenario, "messages", messages.list(), replacements, outDir)
    },
  }
}

type TempDirectory = {
  /** `realpath` を通したパス（macOS では `/private/var/...`）。子プロセスにはこちらを渡す。 */
  readonly real: string
  /** `mkdtemp` が返したままのパス（`/var/...`）。成果物に出たときに両方を置き換える。 */
  readonly given: string
}

function makeTempDirectory(prefix: string): TempDirectory {
  const given = mkdtempSync(path.join(tmpdir(), prefix))
  return { given, real: realpathSync(given) }
}

/**
 * fake driver で tsukumo を1つ起こす。**親の `TSUKUMO_` で始まる変数は外してから渡す**
 * （手元で立てている値で結果が変わらないように）。キャラクターは指定せず、空のホームで同梱の
 * 既定を使う。
 */
function spawnTsukumo(scene: string, home: string, cwd: string): ChildProcess {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("TSUKUMO_")),
  )
  return spawn(process.execPath, ["run", path.join(REPOSITORY_ROOT, "src", "cli.ts")], {
    cwd,
    env: {
      ...inherited,
      TSUKUMO_DRIVER: "fake",
      ...(scene === "none" ? {} : { TSUKUMO_FAKE_SCENE: scene }),
      TSUKUMO_VIEW_PORT: "0",
      TSUKUMO_OPEN_VIEW: "0",
      TSUKUMO_WATCH_UI: "0",
      TSUKUMO_HOME: home,
      TSUKUMO_FIXED_CLOCK: FIXED_INSTANT,
      TZ: TIME_ZONE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
}

/** 起こした pid だけに `SIGTERM` を送り、終わるのを待つ（広いパターンで止めない）。 */
function stopTsukumo(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    child.once("exit", () => {
      resolve()
    })
    child.kill("SIGTERM")
  })
}

/** 起こした tsukumo が出す配信 URL を待つ。出ないまま終わったら、標準エラーを添えて落とす。 */
function waitForViewUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      reject(new Error(`tsukumo が URL を出さない（${String(LAUNCH_TIMEOUT_MS)}ms）\n${stderr}`))
    }, LAUNCH_TIMEOUT_MS)
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
      const url = /https?:\/\/\S+/.exec(stdout)?.[0]
      if (url !== undefined) {
        clearTimeout(timer)
        resolve(url)
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`tsukumo が終了した（コード ${String(code)}）\n${stderr}`))
    })
  })
}

/**
 * ブラウザの時計を凍らせた瞬間から始める。`page.clock.install` は `Date.now()` を差し替えるが
 * `Temporal.Now` は差し替えないので、`Temporal.Now.instant()` を `Date.now()` に従わせる
 * （ブラウザで「いま」を読むのは `src/browser/utils/clock.ts` の1つだけで、そこが呼ぶのは
 * これだけ）。差し込む台本は文字列で渡す——ページの中で動くコードで、このファイルの型と
 * lint の対象にしない。
 */
async function installFixedClock(page: Page): Promise<void> {
  await page.clock.install({ time: Temporal.Instant.from(FIXED_INSTANT).epochMilliseconds })
  await page.addInitScript(
    "Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(Date.now())",
  )
}

/** 購読の手続きの経路（oRPC の要求の `u`）。 */
const FRAME_SUBSCRIBE_URL = "/frame/subscribe"

/** oRPC の封筒で、Event Iterator の1件を表す種別（`@orpc/standard-server-peer` の `MessageType`）。 */
const EVENT_ITERATOR_MESSAGE = 3

type MessageRecord = {
  readonly list: () => readonly unknown[]
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
}

/**
 * WebSocket で送ったコマンドと受け取ったフレームを、届いた順に並べる（`docs/design.md` 10章
 * 「E2E の成果物と再現」の畳み方）。
 */
function recordMessages(page: Page): MessageRecord {
  const entries: unknown[] = []
  // 手続きの要求番号（oRPC の `i`）は送るたびに変わるので、送った順の番号に置き換える。
  const requestOrders = new Map<string, number>()
  const orderOf = (rawId: unknown): number => {
    const key = String(rawId)
    const order = requestOrders.get(key) ?? requestOrders.size + 1
    requestOrders.set(key, order)
    return order
  }
  // 種別ごとに届いた回数（同じ `kind` が場面の中で複数回流れるものを、狙った回目まで待つため）。
  const counts = new Map<string, number>()
  const waiters: {
    readonly kind: string
    readonly target: number
    readonly resolve: () => void
  }[] = []

  // 押し出しの購読（`frame.subscribe`）の要求番号。**購読はコマンドではない**ので列に載せず、
  // その Event Iterator の中身（`t: 3` の `message`）をフレームとしてほどく。
  const subscriptionIds = new Set<string>()

  const receive = (payload: string): void => {
    const envelope = parseRecord(payload)
    if (subscriptionIds.has(String(envelope["i"]))) {
      const message = asRecord(envelope["p"])
      if (envelope["t"] === EVENT_ITERATOR_MESSAGE && message["e"] === "message") {
        receiveFrame(asRecord(asRecord(message["d"])["json"]))
      }
      return
    }
    // 購読のほかに届くのはコマンドの手続きの応答（oRPC の封筒）。状態コードは 200 のとき省かれる。
    if ("i" in envelope) {
      const response = asRecord(envelope["p"])
      entries.push({
        received: "response",
        order: orderOf(envelope["i"]),
        status: response["s"] ?? 200,
        body: response["b"],
      })
    }
  }

  const receiveFrame = (frame: Readonly<Record<string, unknown>>): void => {
    switch (frame["type"]) {
      case "hello":
        entries.push({ received: "hello", protocolVersion: frame["protocolVersion"] })
        break
      case "events": {
        const events = Array.isArray(frame["events"]) ? frame["events"] : []
        for (const stamped of events) {
          const record = asRecord(stamped)
          const event = asRecord(record["event"])
          entries.push({ received: "event", at: record["at"], event: trimEvent(event) })
          const kind = String(event["kind"])
          const nextCount = (counts.get(kind) ?? 0) + 1
          counts.set(kind, nextCount)
          for (const waiter of waiters.filter(
            (candidate) => candidate.kind === kind && nextCount >= candidate.target,
          )) {
            waiter.resolve()
          }
        }
        break
      }
      case "refresh":
        break
      default:
        entries.push({ received: frame["type"], frame })
    }
  }

  // 送るのは手続きの要求（`{ i, p: { u: "/<機能>/<手続き>", b: { json } } }`）。購読の要求だけは
  // 番号を覚えて列に載せない。
  const send = (payload: string): void => {
    const request = parseRecord(payload)
    const body = asRecord(asRecord(request["p"])["b"])
    const url = asRecord(request["p"])["u"]
    if (url === FRAME_SUBSCRIBE_URL) {
      subscriptionIds.add(String(request["i"]))
      return
    }
    entries.push({
      sent: typeof url === "string" ? url.replace(/^\//, "").replaceAll("/", ".") : request,
      order: orderOf(request["i"]),
      input: body["json"],
    })
  }

  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => {
      receive(String(frame.payload))
    })
    socket.on("framesent", (frame) => {
      send(String(frame.payload))
    })
  })

  return {
    list: () => [...entries],
    waitForEvent: (kind, occurrence = 1) => {
      if ((counts.get(kind) ?? 0) >= occurrence) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `イベント ${kind} の${String(occurrence)}回目が届かない（${String(EVENT_TIMEOUT_MS)}ms）`,
            ),
          )
        }, EVENT_TIMEOUT_MS)
        waiters.push({
          kind,
          target: occurrence,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
        })
      })
    },
  }
}

/**
 * `character-changed` はいまのパックの名前と表情だけを残す（同梱のパックの一覧はパックを直す
 * たびに変わり、シナリオが確かめたいことではない）。
 */
function trimEvent(event: Readonly<Record<string, unknown>>): unknown {
  if (event["kind"] === "character-changed") {
    return { kind: event["kind"], pack: event["pack"], expressions: event["expressions"] }
  }
  return event
}

function parseRecord(payload: string): Readonly<Record<string, unknown>> {
  return asRecord(JSON.parse(payload))
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

/**
 * DOM の構造を読み、2回続けて同じになるまで読み直す（時計は止めてあるので、残るのは描き直しと
 * 素材の読み込みだけ）。
 */
async function settledDom(page: Page): Promise<unknown> {
  let previous = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await page.waitForTimeout(SETTLE_INTERVAL_MS)
    const current = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
    if (current === previous) {
      return JSON.parse(current)
    }
    previous = current
  }
  throw new Error(`DOM が落ち着かない（${String(SETTLE_INTERVAL_MS * SETTLE_ATTEMPTS)}ms）`)
}

/**
 * `document.body` から木を組む台本（ページの中で動く）。残すもの・落とすものは
 * `docs/design.md` 10章「E2E の成果物と再現」のとおり。文字列で渡すのは `installFixedClock` と
 * 同じ理由（ページの中のコードで、このファイルの型の対象にしない）。
 */
const DOM_TREE_SCRIPT = `(() => {
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
  const nodeOf = (element) => {
    const tag = element.localName;
    if (SKIPPED.has(tag) || !visible(element)) return [];
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
  return childrenOf(document.body);
})()`

/**
 * 成果物を書き、期待値と比べる。書く前に置き換え（絶対パス・トークン・ポート）を通す。
 * **期待値が無ければ落とす**（黙って書かない）。`E2E_UPDATE=1` なら期待値を書き直す。
 */
function matchArtifact(
  scenario: string,
  kind: "dom" | "messages",
  value: unknown,
  replacements: readonly (readonly [string, string])[],
  outDir: string,
): void {
  const text = `${replaceAll(JSON.stringify(value, undefined, 2), replacements)}\n`
  const fileName = `${scenario}.${kind}.json`
  writeFileSync(path.join(outDir, fileName), text, "utf8")

  const expectedPath = path.join(EXPECTED_ROOT, fileName)
  if (UPDATE_EXPECTED) {
    mkdirSync(EXPECTED_ROOT, { recursive: true })
    writeFileSync(expectedPath, text, "utf8")
    return
  }
  if (!existsSync(expectedPath)) {
    throw new Error(
      `期待値が無い: ${path.relative(REPOSITORY_ROOT, expectedPath)}（bun run test:e2e:update で書き、git diff で中身を確かめる）`,
    )
  }
  expect(JSON.parse(text)).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")))
}

function replaceAll(text: string, replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => current.split(from).join(to), text)
}
