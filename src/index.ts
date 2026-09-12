// tsukumo のエントリポイント。Agent SDK で Claude Code のセッションを起こし、届いたイベントを
// HTML のビューに変えて、ローカルの HTTP サーバから配り続ける。
//
// ここは「配線」の層。引数・環境変数の受け取り、起動時の前提チェック、状態を1つ持つこと、
// 1回分の `try`/`catch` がここの仕事で、判断そのものは持たない。

import { execFile } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import {
  availableExpressions,
  type CharacterDefinition,
  classifyPortraitFile,
  isPlausibleSvgMarkup,
  parseCharacterDefinition,
  rasterMimeType,
  resolveOutfitAccent,
  resolvePortraitFile,
} from "./domain/character.ts"
import {
  type Expression,
  expressionLabel,
  type Outfit,
  resolveOutfit,
  WORKING_EXPRESSION_DELAY_MS,
} from "./domain/expression.ts"
import { type CommandDescription, type SessionEvent } from "./domain/session-event.ts"
import { readTaskSummaries, type TaskSummaryItem } from "./domain/task-summary.ts"
import { bundledFilePath, resolveBundledDir } from "./infrastructure/bundled-path.ts"
import { type Host } from "./infrastructure/host.ts"
import { createOrcaHost } from "./infrastructure/orca-host.ts"
import {
  DEFAULT_PERMISSION_MODE,
  type SessionDriver,
  startSession,
} from "./infrastructure/session-driver.ts"
import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  startOnResolvedPort,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "./infrastructure/view-port.ts"
import { startViewServer, type ViewServer } from "./infrastructure/view-server.ts"
import {
  buildCharacterBody,
  buildMainBody,
  buildPendingAnswerBody,
  buildSidebarBody,
  type CharacterPortraitSource,
  type CharacterViewData,
  type SidebarData,
  type SidebarToolActivity,
  type TurnStatus,
} from "./presentation/view.ts"
import {
  applySessionEvent,
  commandSuggestions,
  currentExpression,
  INITIAL_SESSION_VIEW,
  mainViewEntries,
  type SessionView,
  type ToolActivity,
} from "./usecase/session-view.ts"

const VIEW_PORT_ENV_NAME = "TSUKUMO_VIEW_PORT"
// 起動時にレイアウトページのタブを自動で開くかどうか。既定は開く（コマンド1つで完成させるため）。
const OPEN_VIEW_ENV_NAME = "TSUKUMO_OPEN_VIEW"

const USAGE = `tsukumo — キャラクターと一緒に仕事をするためのターミナル環境

使い方:
  tsukumo   （プロジェクトのディレクトリで打つ。開発中はリポジトリ直下の bun run start でも同じ）

起動すると Claude Code のセッションが立ち上がり、ビューの配信とレイアウトページのタブを
開くところまで1コマンドで進む。**セッションは毎回新規**で、再開はしない。カレントディレクトリを
作業対象にする（claude を打つのと同じ感覚）。

環境変数:
  TSUKUMO_VIEW_PORT       ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。既定のまま塞がっていたら
                          ${String(VIEW_PORT_FALLBACK_ATTEMPTS)}個先まで順にずらす。明示的に指定した
                          ときはずらさずそのまま失敗する。0 を渡すと空きポートを使う）
  TSUKUMO_CHARACTER_DIR   キャラクター定義ディレクトリ（既定は tsukumo 自身の同梱の
                          characters/tsukumo-spirit。自分の素材を使うときは起動先の
                          characters/local などを指す。相対パスは cwd 相対、絶対パスはそのまま）
  TSUKUMO_OPEN_VIEW       起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
`

// ビューを配り直す間隔。本文はトークン単位で流れてくるので、断片1つごとに全ビューを組み直すと
// 無駄が大きい。まとめて配ることで転送量を抑える（反映の遅延目安は1秒以内。
// docs/requirements.md「5. 実行環境・非機能要件」）。
const PUBLISH_INTERVAL_MS = 100

/** ブラウザ側スクリプトの入口。ここから辿れるものが1本にまとまる（`buildBrowserScript`）。 */
const BROWSER_SCRIPT_ENTRY = "main.ts"
/** 組み立てた結果の受け取り上限。超えるとビルドが失敗扱いになる（いまの実測は数KB）。 */
const BROWSER_SCRIPT_MAX_BYTES = 8 * 1024 * 1024

/** CSS の入口。ここから `@import` で辿れるものが1本にまとまる（`buildStyleSheet`）。 */
const STYLE_SHEET_ENTRY = "main.css"
/** 組み立てた結果の受け取り上限。超えるとビルドが失敗扱いになる（いまの実測は数十KB）。 */
const STYLE_SHEET_MAX_BYTES = 8 * 1024 * 1024

// develop/tasks.json は起動時の cwd（リポジトリ直下で `bun run start` する運用）からの相対で読む。
// セッションに依存しない、tsukumo 自身の進捗管理ファイルのため。
const TASKS_FILE_RELATIVE_PATH: readonly string[] = ["develop", "tasks.json"]

// キャラクター定義ディレクトリの既定値。自作で権利がクリーンな tsukumo-spirit を使う
// （docs/requirements.md 4.4）。**tsukumo 自身の場所からの相対**で読む（bundledFilePath）。
// develop/tasks.json とは違い、こちらは同梱物なので cwd には依存させない。
const DEFAULT_CHARACTER_DIR_RELATIVE_PATH: readonly string[] = ["characters", "tsukumo-spirit"]
// 利用者が用意した素材（`characters/local/` など。characters/README.md）を使いたいときに
// 直接指すための環境変数。
const CHARACTER_DIR_ENV_NAME = "TSUKUMO_CHARACTER_DIR"
const CHARACTER_DEFINITION_FILE_NAME = "character.json"
// character.json が無い・壊れている、または name が無いときの立ち絵 alt テキストの既定名。
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/**
 * ブラウザ側スクリプト（`src/presentation/browser/`）を `bun build` で1本にまとめ、
 * **中身を文字列で返す**。
 * 失敗したら undefined を返す（呼び出し側が起動を止める）。
 *
 * **ファイルに書き出さない。** 出力を標準出力で受け取ってメモリに持ち、`src/infrastructure/view-server.ts` が
 * `/assets/browser.js` として配る。ディスクに成果物を残さないので、古いものを配る事故も、
 * `.gitignore` に足す必要も出ない（2026-09-12 T-083 決定）。
 *
 * **`Bun.build()` ではなく `bun build` のプロセスを起こす**のは、`Bun.*` の固有 API に寄せない
 * 規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）のため。`bun` は tsukumo 自身を
 * 動かしている実行環境なので、外部コマンドの依存が増えるわけではない。
 *
 * 型検査はここではしない（`bun build` はトランスパイルだけで型を見ない）。型は
 * `bun run check` の `tsc --noEmit` が見る。**`src/presentation/browser/` も tsconfig の
 * `include`（`src` 配下の `.ts` すべて）に入っている**ので、検査は自動で届く。
 */
function buildBrowserScript(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "presentation", "browser", BROWSER_SCRIPT_ENTRY)
  return new Promise((resolve) => {
    execFile(
      "bun",
      ["build", entry, "--target=browser"],
      { maxBuffer: BROWSER_SCRIPT_MAX_BYTES },
      (error, stdout) => {
        resolve(error === null && stdout !== "" ? stdout : undefined)
      },
    )
  })
}

/**
 * CSS（`src/presentation/style/`）を `bun build` で1本にまとめ、**中身を文字列で返す**。
 * 失敗したら undefined を返す（呼び出し側が起動を止める）。
 *
 * `buildBrowserScript` と同じ形。**ファイルに書き出さない**（`src/infrastructure/view-server.ts` が
 * `/assets/style.css` として配る）。領域ごとに割った `.css`（`src/presentation/style/*.css`）を
 * `main.css` の `@import` で束ねる。
 */
function buildStyleSheet(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "presentation", "style", STYLE_SHEET_ENTRY)
  return new Promise((resolve) => {
    execFile(
      "bun",
      ["build", entry, "--target=browser"],
      { maxBuffer: STYLE_SHEET_MAX_BYTES },
      (error, stdout) => {
        resolve(error === null && stdout !== "" ? stdout : undefined)
      },
    )
  })
}

/**
 * 終了コードを返す。0 のときはビューサーバとセッションを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[]): Promise<number> {
  if (args.includes("--help")) {
    process.stdout.write(USAGE)
    return 0
  }

  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const portResolution = resolveViewPort(process.env[VIEW_PORT_ENV_NAME])
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は**起動のたびに組み立てる**（2026-09-12 T-083 決定、CSS も同じ形に
  // 乗せる）。ディスクに置かないので古い成果物を配る事故が起きず、`.ts` / `.css` を直して起こし直す
  // だけで反映される。組み立てに失敗したらページが動かないので、**ここは起動時の前提不足として
  // 即時終了する**（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」の例外側）。
  const [browserScript, styleSheet] = await Promise.all([buildBrowserScript(), buildStyleSheet()])
  if (browserScript === undefined) {
    process.stderr.write("tsukumo: ブラウザ側スクリプトを組み立てられない\n")
    return 1
  }
  if (styleSheet === undefined) {
    process.stderr.write("tsukumo: CSS を組み立てられない\n")
    return 1
  }

  const host = createOrcaHost()

  // ビューサーバとセッションは互いを必要とする（サーバは依頼をセッションへ渡し、セッションは
  // 配るためにサーバを要る）。**先に立てるのはサーバ**にして、セッションはあとから入る形にした。
  // 起動直後の依頼は受け取れずに 503 で返るだけで、どちらかが欠けて黙って落ちることがない。
  let driver: SessionDriver | undefined = undefined
  // 入力欄の `/` 補完の候補（`GET /api/commands` が読む）。init 前は空配列
  // （docs/requirements.md 4.2「入力欄」）。session-view.ts が端末専用を除いた名前に説明を
  // 添える計算（`commandSuggestions`）を済ませたものをそのまま持つ。
  let commands: readonly CommandDescription[] = []
  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/infrastructure/view-port.ts）。明示的に渡されたときは一度だけ試してそのまま失敗する。
  const startResult = await startOnResolvedPort(portResolution, (port) =>
    startViewServer(
      port,
      (text) => {
        if (driver === undefined) {
          return false
        }
        driver.prompt(text)
        return true
      },
      () => (driver === undefined ? Promise.resolve() : driver.interrupt()),
      (id, answer) => (driver === undefined ? false : driver.answer(id, answer)),
      (mode) =>
        driver === undefined
          ? Promise.resolve(false)
          : driver.setPermissionMode(mode).then(() => true),
      (model) =>
        driver === undefined ? Promise.resolve(false) : driver.setModel(model).then(() => true),
      () => commands,
      browserScript,
      styleSheet,
    ),
  )
  if (!startResult.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${startResult.reason}\n`)
    return 1
  }
  const server = startResult.server

  const characterDir = resolveBundledDir(
    process.env[CHARACTER_DIR_ENV_NAME],
    process.cwd(),
    DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  )
  const readTaskSummary = createTaskSummaryReader()
  const publish = throttle(
    createViewPublisher(server, characterDir, readTaskSummary),
    PUBLISH_INTERVAL_MS,
  )
  publish(INITIAL_SESSION_VIEW)

  driver = startSession({
    cwd: process.cwd(),
    expressions: availableExpressions(readCharacterDefinition(characterDir)),
    permissionMode: DEFAULT_PERMISSION_MODE,
    onEvent: createEventSink(
      publish,
      server.publishTurnStatus,
      server.publishPendingAnswer,
      (next) => {
        commands = next
      },
    ),
  })
  stopSessionOnExit(driver)
  announce(server)

  if (resolveOpenView(process.env[OPEN_VIEW_ENV_NAME])) {
    await openLayoutView(host, server)
  }

  return 0
}

/**
 * イベントを受けて姿を更新し、配る係を呼ぶ。**セッションの姿を持つのはここ1箇所だけ**
 * （畳み込みそのものは純粋関数。src/usecase/session-view.ts）。
 *
 * **`turnInProgress` が変わったときだけ `publishTurnStatus` を呼ぶ。** 書きかけの本文は
 * トークン単位で届くため、変わっていないのに毎回押すと入力欄の SSE だけ無駄に流れてしまう。
 *
 * **答え待ちの列の先頭（`view.pending[0]`）が変わったときだけ `publishPendingAnswer` を呼ぶ**
 * （同じ考え方。同一判定は `id`。答えたら列が進み、次が出る。無くなったら空文字を押す
 * 。docs/requirements.md 4.7「答えるのは入力の動作なので入力欄の側に置く」）。
 *
 * **`turnStartedAt` / `turnFinishedAt`（経過時間の起点・終点）もここで持つ。** `Date.now()` を
 * 呼ぶのは副作用なので、純粋な畳み込み（src/usecase/session-view.ts）の外、配線の層に置く。`request` が
 * 来るたびに `turnStartedAt` を更新し `turnFinishedAt` を undefined に戻し、`turn-finished` /
 * `session-ended` が来たときだけ `turnFinishedAt` を入れる（それ以外では前の値をそのまま持ち
 * 続ける）。表す意味は「依頼を送ってから、そのターンが終わるまでの時間」で、終わったら
 * `turnFinishedAt` が止め、次の `request` まではそのまま止まって見える。**渡す先は
 * `publishTurnStatus` だけ**（2026-09-12 T-075 決定。経過時間の表示先が入力欄側
 * （送信ボタンと同じ行）へ移ったので、サイドバー向けの `publish` はもうこの2つを要らない）。
 * `turnInProgress` の変化と同じ瞬間に確定するので、`publishTurnStatus` を呼ぶ直前に
 * 更新しておく。
 *
 * **表情の「作業中」への遅延切り替え（`WORKING_EXPRESSION_DELAY_MS`）もここで進める。**
 * ツールの開始・終了だけでは、遅延が経過した「その瞬間」には何のイベントも来ないので、
 * 何もしなければ次のイベントが来るまで表情が切り替わらない。実行中のツールがあってまだ
 * 「作業中」になっていないときだけ、遅延の残り時間ぶん先に1回だけ配り直すタイマーを立てる
 * （タイマーは常に1本だけ。イベントが来るたびに立て直す）。
 *
 * **`setCommands` は毎イベントで呼ぶ。** 候補は `session-info` と `command-descriptions` でしか
 * 変わらないが、
 * 変わったかどうかをここで判定する必要はない（呼び出し先の `src/index.ts` の変数への代入は
 * 副作用として軽く、`publishTurnStatus` / `publishPendingAnswer` のような SSE の押し出しとは
 * 違って毎回呼んでも配信は増えない）。
 */
function createEventSink(
  publish: (view: SessionView) => void,
  publishTurnStatus: (status: TurnStatus) => void,
  publishPendingAnswer: (html: string) => void,
  setCommands: (commands: readonly CommandDescription[]) => void,
): (event: SessionEvent) => void {
  let view = INITIAL_SESSION_VIEW
  let turnStartedAt: number | undefined = undefined
  let turnFinishedAt: number | undefined = undefined
  let workingRefreshTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const publishAndScheduleWorkingRefresh = (): void => {
    publish(view)

    if (workingRefreshTimer !== undefined) {
      clearTimeout(workingRefreshTimer)
      workingRefreshTimer = undefined
    }
    const delay = workingRefreshDelayMs(view.runningTools, Date.now())
    if (delay === undefined) {
      return
    }
    workingRefreshTimer = setTimeout(() => {
      workingRefreshTimer = undefined
      publishAndScheduleWorkingRefresh()
    }, delay)
  }

  return (event) => {
    const now = Date.now()
    const next = applySessionEvent(view, event, now)
    if (event.kind === "request") {
      turnStartedAt = now
      turnFinishedAt = undefined
    }
    if (event.kind === "turn-finished" || event.kind === "session-ended") {
      turnFinishedAt = now
    }
    if (next.turnInProgress !== view.turnInProgress) {
      publishTurnStatus({ turnStartedAt, turnFinishedAt })
    }
    if (next.pending[0]?.id !== view.pending[0]?.id) {
      publishPendingAnswer(buildPendingAnswerBody(next.pending[0]))
    }
    view = next
    setCommands(commandSuggestions(view))
    if (event.kind === "session-ended") {
      process.stderr.write(`tsukumo: セッションが終わった: ${event.reason}\n`)
    }
    publishAndScheduleWorkingRefresh()
  }
}

/**
 * 実行中のツールのうち、まだ「作業中」の遅延を超えていないものがあれば、超えるまでの
 * 残り時間（ミリ秒）を返す。超えているものしかない・実行中のツールが無いときは undefined
 * （その場合は時間経過だけで表情が変わることはないので、タイマーを立てる必要がない）。
 */
function workingRefreshDelayMs(
  runningTools: readonly ToolActivity[],
  now: number,
): number | undefined {
  const remaining = runningTools
    .map((tool) => tool.startedAt + WORKING_EXPRESSION_DELAY_MS - now)
    .filter((ms) => ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}

/**
 * ビューを配る係を作る。**「決める → 配る」1回分をまるごと包む唯一の場所**で、ここでの失敗は
 * 次の更新に任せて諦める（docs/coding-standards.md「エラーハンドリング」— 描画ループの中に
 * `try`/`catch` を散らさない）。
 */
function createViewPublisher(
  server: ViewServer,
  characterDir: string,
  readTaskSummary: () => readonly TaskSummaryItem[] | undefined,
): (view: SessionView) => void {
  return (view) => {
    try {
      const data: CharacterViewData = {
        speeches: view.speeches,
        ...readCharacterAssets(
          characterDir,
          currentExpression(view, Date.now()),
          resolveOutfit(view.model),
        ),
      }
      server.publish("character", buildCharacterBody(data))
      server.publish("main", buildMainBody(mainViewEntries(view)))
      server.publish("sidebar", buildSidebarBody(sidebarData(view, readTaskSummary())))
    } catch {
      process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n")
    }
  }
}

/**
 * サイドバーに出す値。**いま何をしているかは実行中・直近の完了のツール名＋入力**
 * （要約は表示側 `src/presentation/view.ts` の仕事。引数の断片が要約に入りうることは
 * `docs/coding-standards.md`「会話内容の扱い」に沿って承知した上で渡す）。**経過時間はここに
 * 無い**（入力欄側へ渡すのは `publishTurnStatus`。2026-09-12 T-075 決定）。
 */
function sidebarData(
  view: SessionView,
  tasks: readonly TaskSummaryItem[] | undefined,
): SidebarData {
  return {
    activity: {
      running: view.runningTools.map(toSidebarToolActivity),
      finished: view.finishedTools.map(toSidebarToolActivity),
    },
    tasks,
    session: {
      model: view.model,
      permissionMode: view.permissionMode,
    },
  }
}

function toSidebarToolActivity(activity: ToolActivity): SidebarToolActivity {
  return { name: activity.name, input: activity.input, nested: activity.nested }
}

/**
 * develop/tasks.json を読む係を作る。**ファイルの mtime を見て、変わったときだけ読み直す**
 * （配信のたびに JSON をパースし直さないため。タスクの決定）。ファイルが消えた・読めなくなったら
 * キャッシュも捨てて undefined に落ちる（次に読めるようになったら追従する）。
 */
function createTaskSummaryReader(): () => readonly TaskSummaryItem[] | undefined {
  const path = join(process.cwd(), ...TASKS_FILE_RELATIVE_PATH)
  let cachedMtimeMs: number | undefined = undefined
  let cached: readonly TaskSummaryItem[] | undefined = undefined

  return () => {
    const mtimeMs = readOptionalMtimeMs(path)
    if (mtimeMs === undefined) {
      cachedMtimeMs = undefined
      cached = undefined
      return undefined
    }
    if (mtimeMs === cachedMtimeMs) {
      return cached
    }

    const content = readOptionalFile(path)
    cached = content === undefined ? undefined : readTaskSummaries(content)
    cachedMtimeMs = mtimeMs
    return cached
  }
}

function readOptionalMtimeMs(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

/**
 * 呼び出しをまとめる。**最後の1回は必ず配る**（間隔の終わりに、そのとき最新の姿を配る）ので、
 * 流れが止まったあとに古い画面が残ることがない。
 */
function throttle<T>(publish: (value: T) => void, intervalMs: number): (value: T) => void {
  let latest: T | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  return (value) => {
    latest = value
    if (timer !== undefined) {
      return
    }

    timer = setTimeout(() => {
      timer = undefined
      const pending = latest
      latest = undefined
      if (pending !== undefined) {
        publish(pending)
      }
    }, intervalMs)
  }
}

/**
 * プロセスが終わるときにセッションを閉じる。**閉じないと claude の子プロセスが残る**ので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 */
function stopSessionOnExit(driver: SessionDriver): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      driver.close()
      process.exit(0)
    })
  }
}

/**
 * レイアウトページのタブを開く。**失敗しても起動は続ける**（`orca` が無い環境では
 * `host.showView` が失敗を返すだけで例外は投げない。docs/coding-standards.md
 * 「エラーハンドリング」— 常駐プロセスは描画1回の失敗で落ちない）。
 */
async function openLayoutView(host: Host, server: ViewServer): Promise<void> {
  const result = await host.showView(server.layoutUrl)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
  }
}

/**
 * 起動時にレイアウトページのタブを自動で開くかどうかを決める。**環境変数が読み取りの唯一の場所**
 * （docs/coding-standards.md「外部の入力を読む場所を1つにする」）。"0" のときだけ開かない
 * （ポート番号のような不正値の弾き方は不要で、それ以外の値はすべて「開く」に倒す）。
 */
function resolveOpenView(rawValue: string | undefined): boolean {
  return rawValue?.trim() !== "0"
}

/**
 * キャラクター定義（character.json）を読む。無い・壊れているときは undefined を返し、
 * 呼び出し側は立ち絵なし・表情は `default` だけにフォールバックする。
 */
function readCharacterDefinition(characterDir: string): CharacterDefinition | undefined {
  const content = readOptionalFile(join(characterDir, CHARACTER_DEFINITION_FILE_NAME))
  return content === undefined ? undefined : parseCharacterDefinition(content)
}

/**
 * キャラクター定義と立ち絵を読み、キャラビューに渡せる形にする。character.json が無い・
 * 壊れている、表情に対応する立ち絵が無い、画像ファイル自体が読めない・種類を判定できない、
 * といったときはすべて `portrait: undefined` に落ちて、呼び出し側（buildCharacterBody）が
 * 吹き出しだけの表示にフォールバックする（docs/requirements.md 4.2「フォールバック」）。
 */
function readCharacterAssets(
  characterDir: string,
  expression: Expression,
  outfit: Outfit,
): Omit<CharacterViewData, "speeches" | "permissionMode"> {
  const definition = readCharacterDefinition(characterDir)

  if (definition === undefined) {
    return {
      portrait: undefined,
      outfitAccent: undefined,
      altText: characterAltText(undefined, expression),
    }
  }

  const outfitAccent = resolveOutfitAccent(definition, outfit)
  const portraitFile = resolvePortraitFile(definition, expression)
  const altText = characterAltText(definition.name, expression)

  if (portraitFile === undefined) {
    return { portrait: undefined, outfitAccent, altText }
  }

  return { portrait: readPortraitSource(join(characterDir, portraitFile)), outfitAccent, altText }
}

function characterAltText(name: string | undefined, expression: Expression): string {
  return `${name ?? DEFAULT_CHARACTER_ALT_NAME}（${expressionLabel(expression)}）`
}

/**
 * 立ち絵1件を読む。SVG はファイルの中身をそのまま持ち出し、ラスタ画像はバイト列を
 * data URI にして持ち出す（view-server.ts がファイルを配る経路を増やさないため。
 * 会話内容と違って立ち絵は毎回同じ小さいファイルなので、都度読み直すコストは無視できる）。
 * 拡張子が SVG でもラスタでもない、中身が SVG らしくない、ファイルが読めない、
 * といったときは undefined を返す。
 */
function readPortraitSource(filePath: string): CharacterPortraitSource | undefined {
  const kind = classifyPortraitFile(filePath)
  if (kind === undefined) {
    return undefined
  }

  if (kind === "svg") {
    const content = readOptionalFile(filePath)
    return content !== undefined && isPlausibleSvgMarkup(content)
      ? { kind: "svg", svgMarkup: content }
      : undefined
  }

  const mimeType = rasterMimeType(filePath)
  const bytes = readOptionalBinaryFile(filePath)
  return mimeType !== undefined && bytes !== undefined
    ? { kind: "image", dataUri: `data:${mimeType};base64,${bytes.toString("base64")}` }
    : undefined
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。
// 利用者が実際に開くのは layoutUrl（3領域をまとめた1枚）だけ。個別ビューのページは
// 2026-09-12 に消した（`docs/architecture.md`「ビューは1枚のページにまとめる」）。
function announce(server: ViewServer): void {
  process.stdout.write(`tsukumo: ビューを配信中\n  ${server.layoutUrl}\n`)
}

/** 無くてもよいファイルを読む。存在しない・読めないときは undefined を返す（例外にしない）。 */
function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

/** 無くてもよいバイナリファイル（立ち絵のラスタ画像）を読む。存在しない・読めないときは undefined。 */
function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
