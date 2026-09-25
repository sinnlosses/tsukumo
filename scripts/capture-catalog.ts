// 画面の**状態のカタログ**を一括で撮る道具。fake driver（`TSUKUMO_DRIVER=fake`）の場面を
// 名前で名指しして tsukumo を1件ずつ起こし、広い窓と狭い窓の2枚を撮って、並べて見るための
// 索引 HTML を書き出す。描画に関わる変更の `evidence`（`docs/architecture.md`
// 「手で確かめること」）を作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// **依頼を手で送らずに、狙った状態が出る。** 場面の名前は疑似セッション（test/fixture/fake-session.json）の
// `turns[].name` で、`TSUKUMO_FAKE_SCENE` で名指しすると起こした直後に流れる。
//
// **手を動かさないと出ない状態は、撮る前に操作を当てて出す**（{@link Preparation} の4種）。
// 領域の内側は転がっても**ページ自体は転がらない**ので、`fullPage` では下の方が1枚も撮れない
// （図とグラフがそれ）。疑似セッションにもサーバにも手を入れず、開いたページを操作して撮る。
//
// 1枚だけ撮る・要素の位置と大きさを数値で読むのは `capture-view.ts`（別の道具）。こちらは
// 「起こす → 撮る → 落とす」を繰り返す側で、測りはしない。
//
// **先に `bun run build` が要る。** 起こす tsukumo は `dist/browser/` に置いた成果物を読むだけで、
// 自分では組み立てない（`src/server/view-server/adapter/bundle.ts` 冒頭）。無いと1件ずつ
// 起動に失敗する。
//
// 使い方:
//   bun run scripts/capture-catalog.ts --help                # --only に使える名前の一覧（撮らない）
//   bun run scripts/capture-catalog.ts --only question-multi  # 1つだけ
//   bun run scripts/capture-catalog.ts --out /tmp/別の置き場
//
// **オプション無しで実行するとカタログ全部（広い窓・狭い窓の2枚ずつ）を撮る。** 60秒では
// 終わらないので、一覧が欲しいだけなら `--help` を使う。
//
// `--help` は専用のフラグとして実装していない。`parseOptions` が「値を取らない・値を持たない
// フラグ」を一律で使い方の表示に落とすので、他のどの未知の引数を渡しても同じ表示になる
// （`--only` の名前一覧はそこに含めている）。
//
// **撮った画像はリポジトリに置かない**（既定の出力先は /tmp。`capture-view.ts` 冒頭の決定を
// 引き継ぐ）。疑似セッションは架空の会話なので画像そのものは共有してよい。
//
// **キャラクターは指定しない。** 起こす側が覚えている立ち絵（`~/.tsukumo/state.json`）を
// そのまま使う — ここで `TSUKUMO_CHARACTER` を渡すと、利用者が最後に選んだ立ち絵を
// 上書きしてしまうため。

import { type ChildProcess, spawn } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Browser, chromium, type Page } from "playwright-core"

import { appendDiaryParagraph } from "../src/server/diary/adapter/diary.ts"

/** tsukumo 自身の場所（このスクリプトの1つ上）。spawn の cwd にも、架空の日記・パックを
 * 置く先を組み立てるのにも使う。 */
const REPO_DIR = fileURLToPath(new URL("..", import.meta.url))

/**
 * 撮る前に当てる操作。**この5種だけ**にする（もとは4種で、`docs/research/ui-catalog.md` 1.4 が
 * 根拠。`hover` は、触れている間だけ出る状態（質問の箱と、メインビューの
 * 比較の札の連動）は押しても出ないため足した）。当てない件は空の並びで表し、「操作が無い」を
 * `undefined` で書かない。
 *
 * - `scroll`: その要素が見えるところまで、**それを囲む領域の内側**を送る
 * - `click`: 押す（モーダルを開く口・狭い窓のタブ）
 * - `hover`: 触れる（押すと状態が進んでしまう場所）
 * - `type`: 入力欄に打つ（`/` と `@` の補完）
 * - `hash`: `location.hash` を書いて画面を移す（キャラクター画面・作る画面）
 */
type Preparation =
  | { readonly kind: "scroll"; readonly selector: string }
  | { readonly kind: "click"; readonly selector: string }
  | { readonly kind: "hover"; readonly selector: string }
  | { readonly kind: "type"; readonly selector: string; readonly text: string }
  | { readonly kind: "hash"; readonly hash: string }

/**
 * 撮る前に、その件専用の `TSUKUMO_HOME` へ置いておくもの。**既定のホーム（利用者の
 * `~/.tsukumo/`）には触らない**——日記帳の見開きや、画面から消せるキャラクターパックは
 * 中身が無いと出せないので、`--out` の下に立てた件専用のホームへだけ書く
 * （{@link applyHomeSetup}）。
 *
 * - `default`: 何もしない（既定のホームのまま起こす。ほとんどの件はこれ）
 * - `diary`: 架空の日記を1件書いてから起こす（`appendDiaryParagraph`。日記帳の見開きを見る件）
 * - `character`: 同梱の `chou` を別名でコピーしたパックを置いてから起こす（画面から消せる
 *   パックが要る件——ホームにしか無いパックだけが `removal: "delete"` になる。
 *   `src/server/character-pack/adapter/character-pack.ts` の `characterPackRemoval`）
 */
type HomeSetup =
  | { readonly kind: "default" }
  | { readonly kind: "diary"; readonly date: string; readonly body: string }
  | { readonly kind: "character"; readonly pack: string }

/**
 * カタログの1件。`scene` は疑似セッション（test/fixture/fake-session.json）の場面の名前で、`name` は
 * **画像のファイル名と `--only` の名指しに使う一意の名前**（同じ場面を別の操作で何枚も撮るので、
 * 場面の名前では足りない）。
 *
 * `skipReveal` は、撮る前に「書き上げていくように見せる演出」
 * （`src/browser/domain/reveal/use-report-reveal.ts`）を着地させておくか。**レポートが長い場面
 * （`notation`）は演出が終わるまで約15秒かかり、そのあいだ演出自身の自動送りが筆先を追い続けて
 * 器を送る**ので、こちらが `scroll` で送った位置をフレームごとに引き戻される（図・グラフは
 * 演出のいちばん最後に出る塊で、演出中はまだ見えていない）。演出はクリックと**キー入力**で
 * 打ち切れる（`use-report-reveal.ts` の `SKIP_EVENT_NAMES`）ので、`prepare` を当てる前に
 * キーを1つ打って演出を終わらせてから送る。**当てない件は待ち時間が変わらない**ので既定は
 * `false`。
 */
type CatalogEntry = {
  readonly name: string
  readonly scene: string
  readonly label: string
  readonly homeSetup: HomeSetup
  readonly prepare: readonly Preparation[]
  readonly skipReveal: boolean
}

/**
 * 本文が入る領域（メインビュー）。**class 名は組み立てのたびにハッシュ化される**（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
const MAIN_REGION_SELECTOR = '[data-region="main"]'

/** 本文が入る領域の中で、**領域の外まではみ出して1枚に入らない**もの（疑似セッションの `notation`）。 */
const MERMAID_SELECTOR = `${MAIN_REGION_SELECTOR} svg`
const CHART_SELECTOR = `${MAIN_REGION_SELECTOR} canvas`
/**
 * `note` の種別の並びのうち**いちばん上に出るもの**（情報）。ここまで送ると、続く注意・異常・
 * 疑問・メモが1枚に収まる（お願いだけは規約でレポートの末尾に置くので別の1枚になる）。
 * **class 名は組み立てのたびにハッシュ化される**（`report-note_nkMPPQ`）ので、種別の印
 * （`report-note-warn` など）を巻き込まないよう**区切りの `_` まで含めて**前方一致で指す
 * （`docs/architecture.md`「手で確かめること」）。
 */
const NOTE_KINDS_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note_"]`

/** 入力欄。ページに `<textarea>` は1つしか無い。 */
const COMPOSER_SELECTOR = "textarea"

/**
 * 狭い窓でだけ出る領域のタブと、タスク一覧を開く口。**広い窓ではタブが隠れている**ので、
 * タブを押す手は空振りする（空振りは飛ばして次の手へ進む。{@link applyPreparation}）。
 */
const SIDEBAR_TAB_SELECTOR = '[role="tab"]:has-text("サイドバー")'
const TASK_BOARD_SELECTOR = 'button:has-text("一覧を見る")'

/**
 * 帯の「いまの作業」の外枠（`data-work-state` を持つ div）の中の押す口。**広い画面の帯と
 * 狭い画面の「≡」の面の両方に同じ部品が置かれる**（`screen-nav-current-work.tsx`）ので、
 * 見えているほうだけを `:visible` で絞る。狭い画面では先に {@link MENU_TOGGLE_SELECTOR} を
 * 押さないとこちらは見えない（{@link applyPreparation} が当たらなかった手を飛ばすので、
 * 広い画面ではこの前の「≡」を押す手が黙って空振りする）。
 */
const WORK_TOGGLE_SELECTOR = "[data-work-state] button[aria-controls]:visible"

/** 狭い画面だけの「≡」（`screen-nav-menu.tsx`）。押すと面の中にもう1つ「いまの作業」の札が
 * 現れる。広い画面では常に `display: none` なので、押す手は空振りしてよい。 */
const MENU_TOGGLE_SELECTOR = 'button[aria-label="メニュー"]'

/** 書き終わりの知らせ（`diary-notice.tsx`）の「日記帳で開く」。成果の画面（`#achievement`）
 * だけに出る（`main.tsx` の `<Activity>`）。 */
const DIARY_NOTICE_OPEN_SELECTOR = 'button:has-text("日記帳で開く")'

/** キャラクター画面、表情のカードの「消す」（`portrait-card.tsx`）。見える字は無くアイコン
 * だけなので `title` で当てる。 */
const PORTRAIT_CLEAR_BUTTON_SELECTOR = 'button[title="消す"]'

/** キャラクター画面、最下部の「このキャラクターを消す」帯のボタン（`character-delete.tsx`）。 */
const CHARACTER_DELETE_BAND_BUTTON_SELECTOR = 'button:has-text("を消す")'

/** {@link HomeSetup} の `character` が置くパックのディレクトリ名。同梱の `chou` とは別名にして、
 * 「ホームにしか無いパック」（`removal: "delete"`）にする。 */
const SAMPLE_CHARACTER_PACK_NAME = "chou-sample"

/** {@link HomeSetup} の `diary` が書く日（`diary-written` 場面が書く日付と揃える）。 */
const DIARY_FIXTURE_DATE = "2026-09-20"

/** {@link HomeSetup} の `diary` が書く本文。架空の日記で、実物の記録ではない。 */
const DIARY_FIXTURE_BODY =
  "今日は日記帳の見開きを撮るための架空の日記。実物の作業内容は含まない。" +
  "ダミーの振り返りとして、架空のタスクを1件終えたことにしてある。"

/**
 * 並べて見たい状態。**網羅はしない** — 直したときに崩れやすい場所（答え待ちの箱・ツールの進行・
 * レポートの記法・補完の候補・キャラクター画面）だけを選ぶ。足すときは疑似セッションに場面を足して、
 * その名前と、撮る前に当てる操作をここに書く。
 */
const CATALOG: readonly CatalogEntry[] = [
  {
    name: "question-multi",
    scene: "question-multi",
    label: "質問（複数選択）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "question-pair",
    scene: "question-pair",
    label: "質問（2問・長い説明）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "question-long",
    scene: "question-long",
    label: "質問（長いラベルと長い説明・複数選択と単一選択）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "question-preview",
    scene: "question-preview",
    label: "質問（選択肢ごとの preview を札の中、説明の下に出す）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "permission",
    scene: "permission",
    label: "許可プロンプト",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "report",
    scene: "report",
    label: "レポートとツールの進行",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "turn-history",
    scene: "turn-history",
    label: "ターンの札（4件）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  {
    name: "notation",
    scene: "notation",
    label: "レポートの記法（引用・表・注意）",
    homeSetup: { kind: "default" },
    prepare: [],
    skipReveal: false,
  },
  // **記法の見本は領域に1枚ぶんが入らない**（1400x900 で 1358px のうち 855px が領域の外）。
  // 領域を伸ばして1枚にすると他の領域が重なって本番と別の姿になるので、**送って複数枚に分ける**。
  {
    name: "notation-note",
    scene: "notation",
    label: "レポートの記法（note の種別。領域を送った先）",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "scroll", selector: NOTE_KINDS_SELECTOR }],
    skipReveal: false,
  },
  {
    name: "notation-figure",
    scene: "notation",
    label: "レポートの記法（図。領域を送った先）",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "scroll", selector: MERMAID_SELECTOR }],
    // **図はレポートの末尾に近く、演出が終わるまで自動送りに送り位置を戻され続ける**（冒頭の
    // `skipReveal` の説明）。
    skipReveal: true,
  },
  {
    name: "notation-chart",
    scene: "notation",
    label: "レポートの記法（グラフ。領域を送った先）",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "scroll", selector: CHART_SELECTOR }],
    skipReveal: true,
  },
  {
    name: "task-board",
    scene: "report",
    label: "タスク一覧のモーダル",
    homeSetup: { kind: "default" },
    prepare: [
      { kind: "click", selector: SIDEBAR_TAB_SELECTOR },
      { kind: "click", selector: TASK_BOARD_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "command-suggestions",
    scene: "report",
    label: "「/」のコマンド補完",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "/c" }],
    skipReveal: false,
  },
  {
    name: "file-suggestions",
    scene: "report",
    label: "「@」のファイル補完",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "@src/browser/" }],
    skipReveal: false,
  },
  {
    name: "character-screen",
    scene: "report",
    label: "キャラクター画面",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "hash", hash: "#character" }],
    skipReveal: false,
  },
  {
    name: "character-create",
    scene: "report",
    label: "キャラクターを作る画面",
    homeSetup: { kind: "default" },
    prepare: [{ kind: "hash", hash: "#character/new" }],
    skipReveal: false,
  },
  // **帯の「いまの作業」の3状態**（`docs/architecture.md`「手で確かめること」）。どれも
  // {@link MENU_TOGGLE_SELECTOR} → {@link WORK_TOGGLE_SELECTOR} の順で押して一覧を開く
  // （広い画面では「≡」が無いので前者は空振りしてよい）。
  {
    name: "current-work-running",
    // **自分の `request` を持つ場面**（`test/fixture/fake-session.json`）なので、名指しで
    // 直接起こしてもターンが進行中のまま20秒続く——その間に撮れば「作業中」と実行中の手順が出る。
    scene: "current-work-running",
    label: "帯の「いまの作業」（実行中）",
    homeSetup: { kind: "default" },
    prepare: [
      { kind: "click", selector: MENU_TOGGLE_SELECTOR },
      { kind: "click", selector: WORK_TOGGLE_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "current-work-failed",
    // **自分の `request` を持つ場面**（`current-work-running` と同じ理由）。`report` 場面には
    // 失敗した手順があっても `request` が無いので「依頼の手順」に一度も現れない
    // （`src/shared/turn-step.ts` の `currentTurnSteps` は最後の `request` より前の手順を
    // 落とす）。ターンが終わったあとでも「前の依頼での手順」に失敗した1件（`isError: true` の
    // Bash）が残る。
    scene: "current-work-failed",
    label: "帯の「いまの作業」（失敗した手順）",
    homeSetup: { kind: "default" },
    prepare: [
      { kind: "click", selector: MENU_TOGGLE_SELECTOR },
      { kind: "click", selector: WORK_TOGGLE_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "current-work-background",
    scene: "background-task",
    label: "帯の「いまの作業」（背景のタスク）",
    homeSetup: { kind: "default" },
    prepare: [
      { kind: "click", selector: MENU_TOGGLE_SELECTOR },
      { kind: "click", selector: WORK_TOGGLE_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "diary-book",
    // `diary-written` 場面の「日記帳で開く」で見開きを開く。中身（本文・しおり）は
    // `homeSetup` が件専用のホームへ書く架空の日記から来る。
    scene: "diary-written",
    label: "日記帳の見開き",
    homeSetup: { kind: "diary", date: DIARY_FIXTURE_DATE, body: DIARY_FIXTURE_BODY },
    prepare: [
      { kind: "hash", hash: "#achievement" },
      { kind: "click", selector: DIARY_NOTICE_OPEN_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "portrait-clear-confirm",
    // 消せるパックが要るので `homeSetup` が件専用のホームへ同梱の `chou` のコピーを置く。
    scene: "report",
    label: "表情を消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: PORTRAIT_CLEAR_BUTTON_SELECTOR },
    ],
    skipReveal: false,
  },
  {
    name: "character-delete-confirm",
    scene: "report",
    label: "キャラクターを消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: CHARACTER_DELETE_BAND_BUTTON_SELECTOR },
    ],
    skipReveal: false,
  },
]

/**
 * 撮る窓の大きさ。**広いほうは `capture-view.ts` の既定と同じ**で、狭いほうは切り替えの規則
 * （各機能の `*.module.css` の `max-width: 760px`）の内側に入る幅にしてある。
 *
 * 狭いほうだけページ全体を撮る。**縦に積み替わる**ので、窓に収まる範囲だけでは下の領域
 * （吹き出しと答え待ちの箱）が1枚に入らない。
 */
const SIZES = [
  { name: "wide", width: 1400, height: 900, fullPage: false },
  { name: "narrow", width: 720, height: 900, fullPage: true },
] as const

/** 既定の出力先。**リポジトリの外**に置く（画面には会話が写るため）。 */
const DEFAULT_OUT_DIR = "/tmp/tsukumo-catalog"

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。ブラウザ側の組み立てを含む。 */
const LAUNCH_TIMEOUT_MS = 30_000

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE / WebSocket があるので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/**
 * 最後の手が流れ終わるまでの余裕（ミリ秒）。**場面はページが繋がってから流れ始める**
 * （fake driver は最初のタブを待つ）ので、`opening`（0.2秒）とカタログの一番長い場面
 * （`turn-history` の約1.4秒）を足したものより後に撮る。
 */
const SCENE_TAIL_MS = 2000

/**
 * 操作を1つ当てるのに待つ上限（ミリ秒）と、当てたあとに描き直しを待つ余裕（ミリ秒）。
 * **窓の大きさによっては当たらない口がある**（狭い窓でしか出ないタブ）ので、短めに切る。
 */
const PREPARE_TIMEOUT_MS = 2000
const PREPARE_SETTLE_MS = 800

/**
 * 演出を打ち切るキー（`entry.skipReveal`。`use-report-reveal.ts` の `SKIP_EVENT_NAMES` は
 * `keydown` ならどのキーでも拾うので、押すキーの意味は問わない）。フォーカスがどこにあっても
 * `window` の listener が capture 段階で拾うので、打つ前にどこかへフォーカスを当てる必要も無い。
 */
const SKIP_REVEAL_KEY = "Escape"

const USAGE = `使い方: bun run scripts/capture-catalog.ts [オプション]

  --out <dir>     画像と索引の出力先（既定 ${DEFAULT_OUT_DIR}）
  --only <name>   カタログのうち1件だけ撮る（${CATALOG.map((entry) => entry.name).join(" / ")}）
`

type Options = {
  readonly outDir: string
  readonly only: string | undefined
}

type Shot = {
  readonly entry: CatalogEntry
  readonly size: (typeof SIZES)[number]
  readonly file: string
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const entries =
    options.only === undefined ? CATALOG : CATALOG.filter((entry) => entry.name === options.only)
  if (entries.length === 0) {
    process.stderr.write(`カタログに無い名前: ${String(options.only)}\n${USAGE}`)
    return 2
  }

  mkdirSync(options.outDir, { recursive: true })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const shots: Shot[] = []
  try {
    for (const entry of entries) {
      shots.push(...(await captureEntry(browser, entry, options.outDir)))
    }
  } finally {
    await browser.close()
  }

  const indexPath = path.join(options.outDir, "index.html")
  writeFileSync(indexPath, indexHtml(shots), "utf8")
  process.stdout.write(`${String(shots.length)}枚。索引: ${indexPath}\n`)
  return 0
}

/**
 * カタログ1件ぶん。**tsukumo を起こし直して撮る**ので、前の場面の記録が画面に残らない
 * （同じセッションに依頼を重ねると、狙った状態だけを撮れない）。
 */
async function captureEntry(
  browser: Browser,
  entry: CatalogEntry,
  outDir: string,
): Promise<readonly Shot[]> {
  // `homeSetup.kind === "default"` の件は既定のホームのまま起こす（`home` は無い）。それ以外の
  // 件だけ、`--out` の下に立てた件専用のホームへ先に架空の中身を書いてから起こす。
  const home = entry.homeSetup.kind === "default" ? undefined : path.join(outDir, "home")
  if (home !== undefined) {
    await applyHomeSetup(entry.homeSetup, home)
  }
  const session = spawnTsukumo(entry.scene, home)
  try {
    const url = await waitForViewUrl(session)
    const shots: Shot[] = []
    for (const size of SIZES) {
      const file = path.join(outDir, `${entry.name}-${size.name}.png`)
      await captureShot(browser, url, entry, size, file)
      process.stdout.write(`撮った: ${file}\n`)
      shots.push({ entry, size, file })
    }
    return shots
  } finally {
    // 起こしたのはこの pid だけ。**広いパターンで落とさない**（開発中の tsukumo を巻き込むため）。
    session.kill("SIGTERM")
  }
}

async function captureShot(
  browser: Browser,
  url: string,
  entry: CatalogEntry,
  size: (typeof SIZES)[number],
  file: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page
      .waitForSelector(MAIN_REGION_SELECTOR, { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined)
    // **疑似セッションが流れ終わってから操作を当てる。** 流れている途中で押すと、狙った状態の手前で
    // 画面が組み直されて操作が空振りする。
    await page.waitForTimeout(SCENE_TAIL_MS)
    if (entry.skipReveal) {
      // **`prepare` の前に演出を終わらせる。** 演出中は自動送りがフレームごとに器を送り直す
      // ので、あとに続く `scroll` の送り先をそのたびに引き戻される（{@link CatalogEntry}
      // の `skipReveal` の説明）。
      await page.keyboard.press(SKIP_REVEAL_KEY)
    }
    for (const step of entry.prepare) {
      await applyPreparation(page, step)
    }
    if (entry.prepare.length > 0) {
      await page.waitForTimeout(PREPARE_SETTLE_MS)
    }
    await page.screenshot({ path: file, fullPage: size.fullPage })
  } finally {
    await page.close()
  }
}

/**
 * 操作を1つ当てる。**当てられなくても撮る** — 窓の大きさによっては出ていない口がある
 * （狭い窓でしか出ない領域のタブ）ので、当たらなかったことだけを出して次の手へ進む。
 * 当たらなかった手のぶん画面は動いていないので、撮れた画像を見れば何が出ていないか分かる。
 */
async function applyPreparation(page: Page, step: Preparation): Promise<void> {
  try {
    switch (step.kind) {
      case "scroll":
        await page
          .locator(step.selector)
          .first()
          .scrollIntoViewIfNeeded({ timeout: PREPARE_TIMEOUT_MS })
        break
      case "click":
        await page.locator(step.selector).first().click({ timeout: PREPARE_TIMEOUT_MS })
        break
      case "hover":
        await page.locator(step.selector).first().hover({ timeout: PREPARE_TIMEOUT_MS })
        break
      case "type":
        await page
          .locator(step.selector)
          .first()
          .pressSequentially(step.text, { timeout: PREPARE_TIMEOUT_MS })
        break
      case "hash":
        await page.evaluate((hash: string) => {
          window.location.hash = hash
        }, step.hash)
        break
    }
  } catch {
    process.stdout.write(`当てられなかった: ${describePreparation(step)}\n`)
  }
}

/** 当てられなかった手を1行で言う（何が出ていない画像なのかを読み手が分かるように）。 */
function describePreparation(step: Preparation): string {
  switch (step.kind) {
    case "scroll":
      return `${step.selector} が見えるまで送る`
    case "click":
      return `${step.selector} を押す`
    case "hover":
      return `${step.selector} に触れる`
    case "type":
      return `${step.selector} に ${step.text} と打つ`
    case "hash":
      return `location.hash に ${step.hash} を書く`
  }
}

/**
 * `entry.homeSetup` を件専用のホームへ反映する。**`default` はここまで来ない**
 * （呼び出し元の {@link captureEntry} が `home` の要らない件では呼ばない）。
 */
async function applyHomeSetup(setup: HomeSetup, homeDir: string): Promise<void> {
  if (setup.kind === "default") {
    return
  }
  if (setup.kind === "character") {
    const source = path.join(REPO_DIR, "characters", "chou")
    const dest = path.join(homeDir, "characters", setup.pack)
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(source, dest, { recursive: true })
    return
  }

  const written = await appendDiaryParagraph(
    REPO_DIR,
    {
      date: setup.date,
      writtenAtEpochMilliseconds: diaryEpochMilliseconds(setup.date),
      body: setup.body,
      expression: "proud",
      writer: { pack: "tsukumo", name: "tsukumo" },
      bookmark: {
        kind: "placed",
        // **`T-` + 数字にしない**（`docs/coding-standards.md`
        // 「コード・ドキュメントにタスク番号を書かない」。しおりの id は自由な文字列なので、
        // その形に見えない架空の名で足りる）。
        taskId: "架空-1",
        summary: "架空の要約（capture-catalog.ts が撮るためのダミー）",
        reason: "架空の理由",
      },
    },
    homeDir,
  )
  if (!written) {
    process.stdout.write("架空の日記を書けなかった（git の共有 .git が見えないなど）\n")
  }
}

/** 架空の日記の書いた時刻（`date` のその日の昼どき。エポックミリ秒）。 */
function diaryEpochMilliseconds(date: string): number {
  return Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone: Temporal.Now.timeZoneId(),
    plainTime: "14:32",
  }).epochMilliseconds
}

/**
 * tsukumo を1つ起こす。**空きポート（`TSUKUMO_VIEW_PORT=0`）**なので、常駐している tsukumo と
 * ぶつからない。タブは開かず（`TSUKUMO_OPEN_VIEW=0`）、駆動は fake driver だけ。`home` は
 * {@link HomeSetup} が件専用のホームを立てたときだけ渡り、既定のホームを `TSUKUMO_HOME` で
 * 上書きする（無ければ既定のまま）。
 */
function spawnTsukumo(scene: string, home: string | undefined): ChildProcess {
  return spawn("bun", ["run", path.join(REPO_DIR, "src", "cli.ts")], {
    cwd: REPO_DIR,
    env: {
      ...process.env,
      ...(home === undefined ? {} : { TSUKUMO_HOME: home }),
      TSUKUMO_DRIVER: "fake",
      TSUKUMO_FAKE_SCENE: scene,
      TSUKUMO_VIEW_PORT: "0",
      TSUKUMO_OPEN_VIEW: "0",
      TSUKUMO_WATCH_UI: "0",
    },
    stdio: ["ignore", "pipe", "inherit"],
  })
}

/** 起こした tsukumo が出す配信 URL（`announce`）を待つ。出ないまま終わったら諦める。 */
function waitForViewUrl(session: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let seen = ""
    const timer = setTimeout(() => {
      reject(new Error(`tsukumo が URL を出さない（${String(LAUNCH_TIMEOUT_MS)}ms）`))
    }, LAUNCH_TIMEOUT_MS)
    const finish = (settle: () => void): void => {
      clearTimeout(timer)
      settle()
    }

    session.stdout?.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8")
      const url = /https?:\/\/\S+/.exec(seen)?.[0]
      if (url !== undefined) {
        finish(() => resolve(url))
      }
    })
    session.on("exit", (code) => {
      finish(() => reject(new Error(`tsukumo が終了した（コード ${String(code)}）`)))
    })
  })
}

/**
 * 並べて見るための索引。**画像を1枚ずつ開かずに済ませる**のが目的なので、飾りは付けず
 * 見出しと画像だけを縦に並べる（外の CSS も JS も読まない）。
 *
 * **1件のぶんは1つの節にまとめ、頭に行き先の一覧を置く** — 件数が増えても、探している件まで
 * 転がし続けずに飛べるようにする。
 */
function indexHtml(shots: readonly Shot[]): string {
  const entries = catalogEntriesOf(shots)
  const links = entries
    .map((entry) => `<li><a href="#${escapeHtml(entry.name)}">${escapeHtml(entry.label)}</a></li>`)
    .join("\n")
  const sections = entries
    .map((entry) => {
      const images = shots
        .filter((shot) => shot.entry.name === entry.name)
        .map(
          (shot) =>
            `<figure><figcaption>${shot.size.width}x${shot.size.height}</figcaption>` +
            `<img src="${escapeHtml(path.basename(shot.file))}" alt="${escapeHtml(entry.label)}"></figure>`,
        )
        .join("\n")
      return (
        `<section id="${escapeHtml(entry.name)}"><h2>${escapeHtml(entry.label)}</h2>` +
        `<p><code>${escapeHtml(entry.name)}</code>（疑似セッションの場面 <code>${escapeHtml(entry.scene)}</code>）</p>` +
        `${images}</section>`
      )
    })
    .join("\n")

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>tsukumo 画面の状態のカタログ</title>
<style>body{font-family:sans-serif;margin:2rem;background:#111;color:#eee}img{max-width:100%;border:1px solid #444}section{margin-bottom:2rem}figure{margin:0 0 1rem}figcaption{color:#aaa;font-size:.85rem}a{color:#7fd}</style>
</head><body>
<h1>画面の状態のカタログ（疑似セッションの架空の会話）</h1>
<nav><ul>
${links}
</ul></nav>
${sections}
</body></html>
`
}

/** 撮れた順のまま、1件につき1つだけ取り出す（同じ件は広い窓と狭い窓で2枚ある）。 */
function catalogEntriesOf(shots: readonly Shot[]): readonly CatalogEntry[] {
  return shots
    .map((shot) => shot.entry)
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** 引数を読む。読めない指定は undefined（呼び出し側が使い方を出す）。 */
function parseOptions(argv: readonly string[]): Options | undefined {
  let outDir = DEFAULT_OUT_DIR
  let only: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (value === undefined) {
      return undefined
    }
    if (flag === "--out") {
      outDir = value
    } else if (flag === "--only") {
      only = value
    } else {
      return undefined
    }
    index += 1
  }

  return { outDir, only }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
