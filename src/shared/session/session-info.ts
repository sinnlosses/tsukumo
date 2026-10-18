// `init` と `sessions-changed` がどこまで届いたかを表す型。

/**
 * `init`（`session-info`）と、続きから始めたときの `sessions-changed` がどこまで届いたか。
 * `sessionId` が分かる口は2つ（`init` と `sessions-changed`）、`permissionMode` は1つ（`init`）なので、どこまで届いたかが3つの状態になる。
 *
 * - `starting`: セッションがまだ起こったばかりで、`init` も `sessions-changed`（続きから始めたときの居場所）もまだ届いていない
 * - `identified`: `sessionId` だけ分かっている。続きから始めたときに `sessions-changed` が `init` より先に届く経路があるので実在する状態
 * - `running`: `sessionId` / `permissionMode` の両方が分かっている。
 *   `permissionMode` を決める口は `init` だけ（`session.setPermissionMode` には確定の合図が無い）で、その `init` は必ず `sessionId` も連れてくるので、`permissionMode` だけ分かっている状態は実在しない
 *
 * `model` はここに入れない（`SessionState.model` に外へ出してある）。
 * `model` は `init` に加えて `model-changed` でも決まり、`sessionId` より先に分かることがある（`init` が来る前の `identified`/`starting` の間にモデルを切り替える経路が実機にある）。
 * ここへ押し込めると `model-changed` が `running` 以外では効かなくなり、切り替えても数秒で古い値に戻って見える（実機で確認）。
 */
export type SessionInfo =
  | { readonly kind: "starting" }
  | { readonly kind: "identified"; readonly sessionId: string }
  | { readonly kind: "running"; readonly sessionId: string; readonly permissionMode: string }
