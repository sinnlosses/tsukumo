// 起動の段取り。**前提を確かめる → いま出すキャラクターを決める → ビューを配る →
// セッションを起こして繋ぐ → 知らせてタブを開く**の順を並べるのがここの仕事で、それぞれの
// 中身は同じ `src/` 直下のファイル（`current-character.ts` / `view-delivery.ts` /
// `session-start.ts`）が持つ。
//
// **即時終了する前提不足はこの1つの関数に集めてある**（ポート・ブラウザ側の成果物・
// 疑似セッション・作業用の worktree の4つ。docs/coding-standards.md「常駐プロセスは描画1回の失敗で落ちない」— 動作中の一時的な失敗は
// その回を諦めて次へ進む）。
//
// ここは配線層（`src/` 直下。`shared` / `core` / `adapter` / `browser` のすべてを import して
// よい唯一の場所。docs/design.md 2章「層と依存の向き」。**`core` から `adapter` を引くのは
// 禁じてあり、両者を結ぶのはここと同じ層だけ**）。

import process from "node:process"

import { createCurrentCharacter } from "./current-character.ts"
import { readUiBundle } from "./server/adapter/bundle.ts"
import { readFakeSession } from "./server/adapter/fake-driver.ts"
import { createOrcaHost } from "./server/adapter/orca-host.ts"
import { createTokenUsageLog } from "./server/adapter/token-usage-log.ts"
import { prepareWorkspace } from "./server/adapter/worktree.ts"
import { type Config, VIEW_PORT_ENV_NAME } from "./server/core/config.ts"
import { type Host } from "./server/core/host.ts"
import { resolveViewPort } from "./server/core/port-resolution.ts"
import { startSession } from "./session-start.ts"
import { startViewDelivery } from "./view-delivery.ts"

/**
 * 起動の段取りを順に進め、終了コードを返す。0 のときはビューサーバとセッションを残したまま
 * プロセスを生かし続けるので、呼び出し側は 0 以外のときだけ `process.exit` する。
 */
export async function run(config: Config): Promise<number> {
  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する。
  const portResolution = resolveViewPort(config.rawViewPort)
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は**事前に組み立てて置いてあるものを読むだけ**
  // （`src/server/adapter/bundle.ts` 冒頭）。**起動の経路から `bun build` は消えていて**、作るのは
  // `bun run build` と `bun run dev` の見張りだけ。無ければページが動かないので、**ここは
  // 起動時の前提不足として即時終了する**（理由に `bun run build` を添える。理由が無いと、
  // 起動できない側は何を打てばよいか分からない）。
  const built = await readUiBundle()
  if (!built.ok) {
    process.stderr.write(`tsukumo: ブラウザ側の成果物を読めない\n${built.reason}\n`)
    return 1
  }

  // **古いものを黙って配らない**（「古い成果物を配る事故」への答え）。古くても画面は動くので
  // 止めはせず、1行だけ知らせて先へ進む。
  if (built.outdated) {
    process.stderr.write(
      "tsukumo: ソース（src/browser/ src/shared/）のほうが成果物より新しい（bun run build まで古い画面が出る）\n",
    )
  }

  // fake driver を選んだときは疑似セッションが要る。無ければ起こす意味が無いので、起動時の
  // 前提不足として扱う。
  const fakeSession = config.driver === "fake" ? readFakeSession() : undefined
  if (config.driver === "fake" && fakeSession === undefined) {
    process.stderr.write("tsukumo: fake driver の疑似セッションを読めない\n")
    return 1
  }

  // **claude をどこで動かすかを決めるのはここ**（`docs/architecture.md`「worktree でセッションを
  // 分ける」）。git リポジトリなら必ず新しく切り、**切れなかったら起動時の前提不足として止める**
  // ——黙って元の作業ツリーで動かすと、分離されているつもりで元を書くことになる。
  const workspace = await prepareWorkspace({ cwd: process.cwd(), enabled: config.worktree })
  if (!workspace.ok) {
    process.stderr.write(`tsukumo: 作業用の worktree を用意できない\n${workspace.reason}\n`)
    return 1
  }

  // 畳めなかった worktree と、切った先を整えきれなかったこと。**知らせるだけで起動は続ける**
  // （成果を黙って消さないことと、取り残しに気づけることの折り合い）。**画面にも出す**
  // （下の `workspaceNotices`）が、タブが開く前に読めるよう端末にも1行ずつ書く。
  for (const notice of workspace.notices) {
    process.stderr.write(`tsukumo: ${notice}\n`)
  }

  const character = createCurrentCharacter(config)

  // トークン消費の記録の口は**1つをここで作って両側へ渡す**（書くのはセッション、読むのは
  // 分析の画面へ配る側）。置き場（`~/.tsukumo/token-usage/`）を知っているファイルを増やさない。
  const tokenUsageLog = createTokenUsageLog()

  const view = await startViewDelivery({
    portResolution,
    bundle: built.bundle,
    character,
    workspace: workspace.workspace,
    tokenUsageLog,
    watchSource: config.watchUi,
  })
  if (!view.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${view.reason}\n`)
    return 1
  }

  // **セッションの印の目印は、実際に待ち受けているポートから決まる**（`config.ts` の
  // `sessionTag`）。同じディレクトリで2つめを起こすとポートが +1 へずれるので、目印も分かれる
  // （docs/requirements.md 4.8「鍵」）。
  const session = startSession({
    config,
    character,
    fakeSession,
    tokenUsageLog,
    viewPort: view.port,
    workspace: workspace.workspace,
    workspaceNotices: workspace.notices,
  })
  view.connect(session)

  stopSessionOnExit(session.close)
  announce(view.url)

  if (config.openView) {
    await openLayoutView(createOrcaHost(), view.url)
  }

  return 0
}

/**
 * プロセスが終わるときにセッションを閉じる。**閉じないと claude の子プロセスが残る**ので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 */
function stopSessionOnExit(closeSessions: () => void): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      closeSessions()
      process.exit(0)
    })
  }
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。**URL には起動トークンが付く**ので、
// タブを開き直すときはこの URL をそのまま使う。
function announce(url: string): void {
  process.stdout.write(`tsukumo: ビューを配信中\n  ${url}\n`)
}

/**
 * レイアウトページのタブを開く。**失敗しても起動は続ける**（`orca` が無い環境では
 * `host.showView` が失敗を返すだけで例外は投げない。docs/coding-standards.md
 * 「エラーハンドリング」— 常駐プロセスは描画1回の失敗で落ちない）。
 */
async function openLayoutView(host: Host, url: string): Promise<void> {
  const result = await host.showView(url)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
  }
}
