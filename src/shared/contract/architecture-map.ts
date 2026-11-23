// アーキテクチャの地図を引く手続きの契約。
// 運ぶのは箱の ID・表示名・役割の1行・用語・エッジの本数・ファイルのパスで、ファイルの中身と会話の文面は入らない。

import { oc } from "@orpc/contract"

import {
  mapBoxIndexResponseSchema,
  mapSelectionSchema,
  mapViewResponseSchema,
} from "../architecture-map/map-view.ts"

export const architectureMapContract = {
  /**
   * 縮尺で全体の図を、または箱を指してその子の図を引く。
   * 地図のファイルが無い・読めない・指した箱が使えないときは、失敗のエラーにせず理由つきの応答で返す。
   */
  view: oc.input(mapSelectionSchema).output(mapViewResponseSchema),
  /** 大・中・小の全部の箱の索引を引く。地図が無い・読めないときは理由つきの応答で返す。 */
  boxes: oc.output(mapBoxIndexResponseSchema),
}
