// 起動の前提の確かめ。
// 即時終了する前提不足はここの1つに集めてある（ポート・ブラウザ側の成果物・取り込んだプラグイン・疑似セッションの4つ）。
// 欠けていれば理由を stderr に出し、呼ぶ側は即時終了する。

import process from "node:process"

import { type Config, type ConfigDriver, ENV_NAMES } from "../server/core/config.ts"
import { readFakeSession } from "../server/session-driver/adapter/fake/fake-session.ts"
import {
  figurePluginDir,
  readFigurePluginMount,
  readWorkflowPlugin,
  readWorkflowPluginMount,
  workflowPluginDir,
} from "../server/session-driver/adapter/workflow-plugin.ts"
import type { SessionDriverOptions } from "../server/session-driver/core/session-driver.ts"
import {
  builtUiDir,
  readUiBundle,
  type UiBundle,
} from "../server/view-server/adapter/build/bundle.ts"
import type { ResolvedViewPort } from "../shared/view-server/view-port.ts"
import { readStartupPrerequisites } from "./startup-order.ts"
import type { WiringDriver } from "./wiring-context.ts"
import { chooseTw } from "./workflow-setting.ts"

/** セッションに載せるプラグインの判定と、ワークフローの `tw` のパス。 */
export type SessionPlugins = Pick<
  SessionDriverOptions,
  "mountWorkflowPlugin" | "mountFigurePlugin" | "workflowTw"
>

export type StartupPrerequisites = {
  readonly portResolution: ResolvedViewPort
  /** 起動のときに読んだブラウザ側の1組。 */
  readonly bundle: UiBundle
  readonly plugins: SessionPlugins
  readonly driver: WiringDriver
}

/** 前提を順に確かめる。欠けていれば理由を stderr に出して `failed` を返す。 */
export async function checkStartupPrerequisites(
  config: Config,
): Promise<
  | { readonly kind: "ok"; readonly prerequisites: StartupPrerequisites }
  | { readonly kind: "failed" }
> {
  const portResolution = config.viewPort
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${ENV_NAMES.viewPort.name} がポート番号として読めない\n`)
    return { kind: "failed" }
  }

  // ブラウザ側スクリプトと CSS は `pnpm run build` が置いたものを読むだけで、起動時には組み立てない。
  // 理由に `pnpm run build` を添える（無いと、起動できない側は何を打てばよいか分からない）。
  // fake driver はプラグインを載せないので見ない。
  const { built, workflowPlugin } = await readStartupPrerequisites({
    readBundle: () => readUiBundle(builtUiDir()),
    checkPlugin: () => {
      const { driver } = config
      switch (driver.kind) {
        case "fake":
          return Promise.resolve({
            kind: "ok",
            mount: true,
            mountFigure: false,
            notices: [],
          } as const)
        case "sdk":
          return checkWorkflowPlugin(config.claudeConfigDir)
        default:
          return driver satisfies never
      }
    },
  })
  if (built.kind === "missing") {
    process.stderr.write(`tsukumo: ブラウザ側の成果物を読めない\n${built.reason}\n`)
    return { kind: "failed" }
  }

  // 古い成果物を黙って配らない。
  // 古くても画面は動くので止めはせず、1行だけ知らせて先へ進む。
  if (built.outdated) {
    process.stderr.write(
      "tsukumo: ソース（src/browser/ src/shared/）が成果物を組み立てたときから変わっている（pnpm run build まで古い画面が出る）\n",
    )
  }

  for (const notice of workflowPlugin.notices) {
    process.stderr.write(`${notice}\n`)
  }
  if (workflowPlugin.kind === "unavailable") {
    return { kind: "failed" }
  }

  const wiringDriver = wiringDriverOf(config.driver)
  if (wiringDriver.kind === "unreadable") {
    process.stderr.write(
      `tsukumo: fake driver の疑似セッションを読めない: ${wiringDriver.reason}\n`,
    )
    return { kind: "failed" }
  }

  return {
    kind: "ok",
    prerequisites: {
      portResolution,
      bundle: built.bundle,
      plugins: {
        mountWorkflowPlugin: workflowPlugin.mount,
        mountFigurePlugin: workflowPlugin.mountFigure,
        workflowTw: chooseTw(config.twCommand, workflowPlugin.mount),
      },
      driver: wiringDriver.driver,
    },
  }
}

/**
 * 取り込んだ tsukumo-plugins が読めるかの検査と、セッションに載せるかの判定。
 * 読めないとき、と一部だけのときは、理由を stderr に1行出す（揃っていて載せないのは通常の状態なので黙る）。
 * 図のプラグインは任意で、取り込みに無いときは黙って載せず、利用者が入れているときだけ知らせる。
 */
async function checkWorkflowPlugin(claudeConfigDir: string | undefined): Promise<
  | {
      readonly kind: "ok"
      readonly mount: boolean
      readonly mountFigure: boolean
      readonly notices: readonly string[]
    }
  | { readonly kind: "unavailable"; readonly notices: readonly string[] }
> {
  const plugin = await readWorkflowPlugin(workflowPluginDir())
  if (plugin.kind === "missing") {
    return {
      kind: "unavailable",
      notices: [`tsukumo: 取り込んだプラグインを読めない\n${plugin.reason}`],
    }
  }
  const mount = await readWorkflowPluginMount(workflowPluginDir(), claudeConfigDir)
  const figure = await readFigurePluginMount(figurePluginDir(), claudeConfigDir)
  const notices = [
    ...(mount.kind === "partial"
      ? [`tsukumo: plugin partly missing (${mount.missing.join(", ")}): using bundled one`]
      : []),
    ...(figure.kind === "user-installed"
      ? ["tsukumo: figure-capture is already installed: not mounting the bundled one"]
      : []),
  ]
  return {
    kind: "ok",
    mount: mount.kind !== "user-installed",
    mountFigure: figure.kind === "mount",
    notices,
  }
}

function wiringDriverOf(
  driver: ConfigDriver,
):
  | { readonly kind: "ok"; readonly driver: WiringDriver }
  | { readonly kind: "unreadable"; readonly reason: string } {
  switch (driver.kind) {
    case "sdk":
      return { kind: "ok", driver }
    case "fake": {
      const reading = readFakeSession(driver.sessionPath)
      if (reading.kind === "unreadable") {
        return reading
      }
      return {
        kind: "ok",
        driver: {
          kind: "fake",
          session: reading.session,
          scene: driver.scene,
          sceneUntil: driver.sceneUntil,
        },
      }
    }
    default:
      return driver satisfies never
  }
}
