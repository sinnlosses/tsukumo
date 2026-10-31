// 撮影の道具の引数の解釈と使い方の文。

import { statSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { readClockInstant } from "../../shared/capture-clock.ts"
import { positiveIntegerArgument } from "../../shared/positive-integer-argument.ts"
import { PREPARATION_OPTIONS, type Preparation, readPreparations } from "./capture-preparation.ts"
import { parseSize, type WindowSize } from "./capture-size.ts"
import { type Source, sourceOf } from "./capture-source.ts"
import { readHeldProcedure, readRpcStub, type RpcStub } from "./capture-stub.ts"

/** 既定の窓の大きさ。実機の目視で使ってきた値に揃えてある。 */
const DEFAULT_WIDTH = 1400
const DEFAULT_HEIGHT = 900

/** `--paper-metric` が `--viewport` の指定なしで測る窓の並び。 */
const DEFAULT_PAPER_METRIC_VIEWPORTS: readonly WindowSize[] = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

/** 既定の出力先。リポジトリの外に置く（会話の内容が写るため）。 */
const DEFAULT_OUT = "/tmp/tsukumo-view.png"

export const USAGE = `使い方:
  node scripts/capture/capture-view.ts <URL> [オプション]
  node scripts/capture/capture-view.ts --scene <場面> [オプション]
  node scripts/capture/capture-view.ts --list-scenes [--session <ファイル>]

  --scene <場面>        fake driver の tsukumo を自分で起こして撮り、終わったら自分で止める
                        （場面は fixture/fake-session/〔--session があればその索引〕の場面名。URL とは併用しない）
  --cwd <dir>           --scene の tsukumo を起こす作業ディレクトリ（.beads や課題ファイルを探す先。既定はこの作業ツリー。手元の画像を置く場面は --out の隣に架空の画像入りの作業場所を立てる。件が演出を打ち切る場面は、--cwd の有無に関わらず打ち切ってから撮る。--scene と一緒にだけ使う）
  --session <ファイル>  --scene・--list-scenes が読む疑似セッションの索引を同梱のファイルから差し替える（ファイルでなければ使い方を出して終わる）。読ませるのは架空の会話だけで、実物の会話（transcript・SDK のイベント）は渡さない
  --until-step <n>      --scene の場面を先頭から n 手目で止めた画を撮る（正の整数。--scene と一緒にだけ使う）
  --list-scenes         場面ごとに report に出る塊の kind と、書き上げる演出が掛かる見込みを一覧して終わる（撮らない。見込みは節の文字数からの見積もりで、描いて確かめてはいない）
  --out <path>          画像の出力先（既定 ${DEFAULT_OUT}）
  --size <幅>x<高さ>    窓の大きさ（既定 ${String(DEFAULT_WIDTH)}x${String(DEFAULT_HEIGHT)}）
  --measure <selector>  位置と大きさ（と scrollHeight・clientHeight）を数値で出す要素（何度でも指定できる）
  --text-length <selector> 要素（複数に当たれば先頭）の見えている文字数を「字数 <selector>: n」で出す（何度でも指定できる。当たらなければ「無し」）
  --wait-for <selector> 要素が出て、演出が終わるまで待ってから撮る（出なければ失敗して終わる）
  --scroll-to <selector> 要素をメインビューの上端へ送ってから撮る（無ければ失敗して終わる。本文の末尾に近い塊も上端へ届くよう、撮影のページだけ末尾に窓の高さ分の余白を足すので、--measure の scrollHeight は余白を含む。2つ以上に当たるとコンマ区切りでも先頭へ転がし、「一致 n 個、先頭へ転がした」の行を出す。準備の手のあとに当たり〔書く位置は問わない〕、転がしたあと偽の時計があれば進めて落ち着くまで待つので、--advance を後ろに足さなくてよい。--reveal-at のときは時計を止めているので待たない）
  --type <selector> <文字>  入力欄に打ってから撮る
  --click <selector>    押してから撮る
  --hover <selector>    触れてから撮る
  --hash <hash>         location.hash を書いてから撮る
  --press <キー名>      キーを押してから撮る（Escape など。狭い窓の引き出しを閉じる。キーはフォーカスの置き場所へ届く。メインビューの中でもモーダルの中でもないと、置き場所を知らせる行を出す。PageDown などは先に --click で中を押す）
  --advance <ms>        偽の時計をミリ秒だけ進めてから撮る（待ち時間で出る画。Temporal.Now も従う）
  --clock <ISO 時刻>    ブラウザの時計をその時刻に決めて撮る（日付で表示が変わる画。オフセット付き、例 2026-01-15T12:00:00+09:00。Temporal.Now も従う）
  --reveal-at <ms>      書き上げる演出が始まった時点から偽の時計をミリ秒だけ進めたところで止め、途中の画を撮る（正の整数。--scene と一緒にだけ使う。演出は打ち切らず、--wait-for・--advance などの操作とは併用できない。演出が始まらない場面は 15 秒待って失敗するので、先に --list-scenes の見込みを見る）
  --wait-after <selector> その位置で要素が出るのを待つ（--hash で開いた画面の読み込みなど。出なければ失敗して終わる）
                        （7つは書いた順に、--wait-for のあと・--scroll-to の前に当てる。当たらなければ失敗して終わる）
  --stub-rpc '<手続き>[@<範囲>]=<JSON>'  手続きの応答を差し替えて撮る（何度でも指定できる。例 'planUsage.report={"kind":"not-applicable"}'。範囲は呼び出しの何回目かを1から数えて 3 か 1-2、省くと全部。範囲の外はサーバへ通す）
  --hold-rpc <手続き>   手続きの応答を保留して読み込み中の骨組みを撮る（何度でも指定できる。例 'contextUsage.report'）
  --hold-stream         セッションの購読（/ws）のサーバからのフレームを保留して撮る（タスク一覧の骨組み）
  --paper-metric        レポートの紙面の物差し（テンプレの手がかり・色相の族・判決の頭の高さ・読む面を超える図・横並びの縦落ち）を窓ごとに表で出す（既定は 1440x900 と 1920x1080。--reveal-at とは併用できない）
  --viewport <幅>x<高さ> --paper-metric で測る窓（何度でも指定できる。--paper-metric と一緒にだけ使う）
  --full                ページ全体を撮る（既定は窓に収まる範囲だけ）
`

export type Options =
  | { readonly kind: "list-scenes"; readonly session: string | undefined }
  | CaptureOptions

export type CaptureOptions = {
  readonly kind: "capture"
  readonly source: Source
  readonly out: string
  readonly width: number
  readonly height: number
  readonly measures: readonly string[]
  readonly textLengths: readonly string[]
  readonly waitFor: string | undefined
  readonly scrollTo: string | undefined
  readonly preparations: readonly Preparation[]
  readonly clock: number | undefined
  readonly revealAt: number | undefined
  readonly stubs: readonly RpcStub[]
  readonly heldProcedures: readonly string[]
  readonly holdStream: boolean
  readonly paperMetric: boolean
  readonly viewports: readonly WindowSize[]
  readonly fullPage: boolean
}

/**
 * 引数を読む。URL と `--scene` のどちらも無い・両方ある・`--size` が読めないときは undefined
 * （呼び出し側が使い方を出す）。`--type` の2つ目の値でない位置引数は1つだけ URL として読む。
 */
export function parseOptions(argv: readonly string[]): Options | undefined {
  try {
    return readOptions(argv)
  } catch {
    return undefined
  }
}

function isFile(target: string): boolean {
  try {
    return statSync(target).isFile()
  } catch {
    return false
  }
}

function readOptions(argv: readonly string[]): Options | undefined {
  const { values, tokens } = parseArgs({
    args: [...argv],
    strict: true,
    allowPositionals: true,
    tokens: true,
    options: {
      ...PREPARATION_OPTIONS,
      out: { type: "string" },
      measure: { type: "string", multiple: true },
      "text-length": { type: "string", multiple: true },
      "wait-for": { type: "string" },
      "scroll-to": { type: "string" },
      scene: { type: "string" },
      cwd: { type: "string" },
      "until-step": { type: "string" },
      "reveal-at": { type: "string" },
      clock: { type: "string" },
      size: { type: "string" },
      "stub-rpc": { type: "string", multiple: true },
      "hold-rpc": { type: "string", multiple: true },
      "hold-stream": { type: "boolean" },
      "paper-metric": { type: "boolean" },
      viewport: { type: "string", multiple: true },
      full: { type: "boolean" },
      "list-scenes": { type: "boolean" },
      session: { type: "string" },
    },
  })
  const session = values.session === undefined ? undefined : path.resolve(values.session)
  if (session !== undefined && !isFile(session)) {
    return undefined
  }
  if (values["list-scenes"] === true) {
    return { kind: "list-scenes", session }
  }

  const prepared = readPreparations(tokens)
  const untilStep =
    values["until-step"] === undefined
      ? undefined
      : positiveIntegerArgument.safeParse(values["until-step"])
  const revealAt =
    values["reveal-at"] === undefined
      ? undefined
      : positiveIntegerArgument.safeParse(values["reveal-at"])
  const clock = values.clock === undefined ? undefined : readClockInstant(values.clock)
  const size = values.size === undefined ? undefined : parseSize(values.size)
  const stubs = (values["stub-rpc"] ?? []).map(readRpcStub)
  const held = (values["hold-rpc"] ?? []).map(readHeldProcedure)
  const paperMetric = values["paper-metric"] === true
  const viewports = (values.viewport ?? []).map(parseSize)
  const urls = tokens.flatMap((token, index) =>
    token.kind === "positional" && !prepared?.textTokenIndexes.has(index) ? [token.value] : [],
  )
  if (
    prepared === undefined ||
    urls.length > 1 ||
    (untilStep !== undefined && !untilStep.success) ||
    (revealAt !== undefined &&
      (!revealAt.success ||
        values.scene === undefined ||
        values["wait-for"] !== undefined ||
        prepared.preparations.length > 0)) ||
    (values.clock !== undefined && clock === undefined) ||
    stubs.some((stub) => stub === undefined) ||
    held.some((procedure) => procedure === undefined) ||
    viewports.some((viewport) => viewport === undefined) ||
    (viewports.length > 0 && !paperMetric) ||
    (paperMetric && revealAt !== undefined) ||
    (values.size !== undefined && size === undefined)
  ) {
    return undefined
  }

  const source = sourceOf(
    urls[0],
    values.scene,
    untilStep?.data,
    values.cwd === undefined ? undefined : path.resolve(values.cwd),
    session,
  )
  return source === undefined
    ? undefined
    : {
        kind: "capture",
        source,
        out: values.out ?? DEFAULT_OUT,
        width: size?.width ?? DEFAULT_WIDTH,
        height: size?.height ?? DEFAULT_HEIGHT,
        measures: values.measure ?? [],
        textLengths: values["text-length"] ?? [],
        waitFor: values["wait-for"],
        scrollTo: values["scroll-to"],
        preparations: prepared.preparations,
        clock,
        revealAt: revealAt?.data,
        stubs: stubs.filter((stub) => stub !== undefined),
        heldProcedures: held.filter((procedure) => procedure !== undefined),
        holdStream: values["hold-stream"] === true,
        paperMetric,
        viewports:
          viewports.length === 0
            ? DEFAULT_PAPER_METRIC_VIEWPORTS
            : viewports.filter((viewport) => viewport !== undefined),
        fullPage: values.full === true,
      }
}
