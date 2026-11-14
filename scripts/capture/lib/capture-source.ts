// 撮影の道具が開く先の型と、引数から開く先を決める読み方。

/**
 * 開く先。URL を直に渡すか、場面の名前で fake driver の tsukumo を自分で起こすか。
 * 場面のときは、起こす tsukumo の起動先（`.beads` や課題ファイルを探す作業ディレクトリ）を持つ。
 */
export type Source =
  | { readonly kind: "url"; readonly url: string }
  | {
      readonly kind: "scene"
      readonly scene: string
      readonly until?: number
      /** `--cwd` で渡されたか、場面に合う作業場所を呼ぶ側が決めるか。 */
      readonly launch: SceneLaunch
      /** `--session` で渡された疑似セッションのファイル。無ければ undefined（同梱のファイル）。 */
      readonly session?: string
    }

export type SceneLaunch =
  | { readonly kind: "given"; readonly cwd: string }
  | { readonly kind: "by-scene" }

/**
 * URL と場面名のどちらか片方だけが要る。
 * 両方・どちらも無いとき、場面の無い `--until-step`・`--cwd`・`--session` は undefined。
 */
export function sourceOf(
  url?: string,
  scene?: string,
  untilStep?: number,
  cwd?: string,
  session?: string,
): Source | undefined {
  if (
    url !== undefined &&
    scene === undefined &&
    untilStep === undefined &&
    cwd === undefined &&
    session === undefined
  ) {
    return { kind: "url", url }
  }
  if (scene !== undefined && url === undefined) {
    const launch: SceneLaunch = cwd === undefined ? { kind: "by-scene" } : { kind: "given", cwd }
    return { kind: "scene", scene, until: untilStep, launch, session }
  }
  return undefined
}
