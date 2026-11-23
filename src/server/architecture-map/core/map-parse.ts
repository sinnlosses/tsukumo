// 地図のファイルの中身（文字列）を契約の型に畳む。内側へは契約を満たした地図か、読めない理由だけが渡る。

import { isPlainObject } from "remeda"

import {
  ARCHITECTURE_MAP_VERSION,
  type ArchitectureMap,
  architectureMapSchema,
  type MapUnreadableReason,
} from "../../../shared/architecture-map/architecture-map.ts"
import { parseJson } from "../../../shared/utils/parse-json.ts"

export type ArchitectureMapParse =
  | { readonly kind: "map"; readonly map: ArchitectureMap }
  | { readonly kind: "unreadable"; readonly reason: MapUnreadableReason }

/** 地図のファイルの中身を読む。版が新しいときは、ほかの欄が契約に沿うかを見ずに知らない版として返す。 */
export function parseArchitectureMap(text: string): ArchitectureMapParse {
  return parseMapValue(parseJson(text))
}

function parseMapValue(value: unknown): ArchitectureMapParse {
  if (value === undefined) {
    return { kind: "unreadable", reason: "not-json" }
  }
  if (!isPlainObject(value)) {
    return { kind: "unreadable", reason: "off-contract" }
  }
  const { version } = value
  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > ARCHITECTURE_MAP_VERSION
  ) {
    return { kind: "unreadable", reason: "newer-version" }
  }
  const parsed = architectureMapSchema.safeParse(value)
  return parsed.success
    ? { kind: "map", map: parsed.data }
    : { kind: "unreadable", reason: "off-contract" }
}
