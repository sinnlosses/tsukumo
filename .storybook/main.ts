// Storybook の設定。部品を props ごとに並べて見るための道具で、tsukumo 本体からは読まれない。
//
// 組み立ては本体と同じ `vite.config.ts` を読む（`build` の節だけは Storybook が捨てる）。
// CSS Modules の class 名は Vite が中身から焼くので、`pnpm run build` の成果物と同じ綴りになる。
//
// 部品が実行時に取りに行く2つの経路は、tsukumo のサーバと同じ中身をここで配る:
// `/character/<pack>/<file>` は同梱のパック（`characters/`）をそのまま、
// `/vendor/<name>` は `createVendorAssetReader` の対応表をそのまま使う（名前の対応を二重に持たない）。
// ホームのパック（`~/.tsukumo/characters/`）は配らない。
//
// story の置き場は `story/` の下で、`src/` と同じ相対パスに `<部品>.story.tsx` を置く。

import type { StorybookConfig } from "@storybook/react-vite"
import type { Plugin } from "vite"

import { createVendorAssetReader } from "../src/server/view-server/adapter/vendor-asset.ts"
import { VENDOR_PATH_PREFIX } from "../src/shared/view-server/vendor-asset.ts"

const readVendorAsset = createVendorAssetReader()

const config = {
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: "vite.config.ts" } },
  },
  stories: ["../story/**/*.story.tsx"],
  staticDirs: [{ from: "../characters", to: "/character" }],
  // 使い方の統計を外へ送らない。
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), vendorAssetPlugin()],
  }),
} satisfies StorybookConfig

export default config

/** 開発サーバで `/vendor/<name>` を配る。対応表に無い名前は次へ回す（Storybook が 404 にする）。 */
function vendorAssetPlugin(): Plugin {
  return {
    name: "tsukumo-vendor-asset",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? ""
        const asset = path.startsWith(VENDOR_PATH_PREFIX)
          ? readVendorAsset(path.slice(VENDOR_PATH_PREFIX.length))
          : undefined
        if (asset === undefined) {
          next()
          return
        }
        response.setHeader("Content-Type", asset.contentType)
        response.end(asset.content)
      })
    },
  }
}
