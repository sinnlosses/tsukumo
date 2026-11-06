// ビューサーバに外から差し込む口の型。型だけで、このディレクトリの組み立て側のファイルは読まない。

import type { Router } from "@orpc/server"

import type { CharacterAssetLocation } from "../../../shared/character-pack/character-asset.ts"
import type { rpcContract } from "../../../shared/rpc.ts"
import type { UiBundle } from "./build/bundle.ts"
import type { UiDevServer } from "./build/ui-dev-server.ts"
import type { RpcContext } from "./rpc/rpc-guard.ts"

/**
 * ブラウザ側をどこから配るか。`bundle` は組み立て済みのスクリプトと CSS の対を `/assets/` から、
 * `dev` は Vite の開発サーバが入口から辿るモジュールを、ここの経路に無い要求として配る。
 */
export type ViewUi =
  | { readonly kind: "bundle"; readonly bundle: UiBundle }
  | { readonly kind: "dev"; readonly devServer: UiDevServer }

/** `/character/<pack>/<file>` を1件配るために要るもの。中身はキャラクターパックを読むアダプタが決める。 */
type CharacterAssetFile = {
  readonly contentType: string
  readonly content: Buffer
  /** 要求の `?v=` が素材の今の版と一致した（ブラウザに長期に持たせてよい）。 */
  readonly versioned: boolean
}

/**
 * `/character/<pack>/<file>` の1件を配ってよい形にする（`readCharacterAsset` を束ねる）。
 * `version` は要求の `?v=`（無ければ undefined）。
 * 無いパック・allowlist に無い・ディスクに無いときは undefined（呼び出し側が404にする）。
 */
export type ServeCharacterAsset = (
  location: CharacterAssetLocation,
  version?: string,
) => CharacterAssetFile | undefined

/** `/item/<file>` を1件配るために要るもの。中身はアイテムの置き場を読むアダプタが決める。 */
type ItemAssetFile = {
  readonly contentType: string
  readonly content: Buffer
  /** 要求の `?v=` が素材の今の版と一致した（ブラウザに長期に持たせてよい）。 */
  readonly versioned: boolean
}

/**
 * `/item/<file>` の1件を配ってよい形にする。`version` は要求の `?v=`（無ければ undefined）。
 * 一覧に載っていない・ディスクに無いときは undefined（呼び出し側が404にする）。
 */
export type ServeItemAsset = (fileName: string, version?: string) => ItemAssetFile | undefined

/**
 * 置き場から、id が指す原寸の data URL を引く。
 * 棚に無い（捨てた・知らない）ときは undefined（配る側が 404 にする）。
 */
export type FindPromptImage = (id: string) => string | undefined

/**
 * 置き場から、レポートの呼び出しの id と部品のパスの組が指す画像を引く。
 * 棚に無い（捨てた・読めなかった・知らない）ときは undefined（配る側が 404 にする）。
 */
export type FindReportImage = (
  toolUseId: string,
  path: string,
) => { readonly mediaType: string; readonly content: Uint8Array } | undefined

/** `/rpc` に載せるルータ（全機能の手続きを束ね、照合のミドルウェアを掛けたもの）。ここはどの手続きがあるかを知らない。 */
export type RpcRouter = Router<typeof rpcContract, RpcContext>
