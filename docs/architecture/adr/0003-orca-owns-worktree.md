# worktree を用意するのは orca で、tsukumo はやらない（2026-09-23）

**2026-09-22 に入れた「セッションごとに git worktree を切る」形を、翌日そのまま撤去した。**
tsukumo 側で切る・畳む・本体へマージする・着手の印を置くまでを持つと運用が重くなるため、
**作業ツリーを分けるのはホスト（orca）の仕事**にし、tsukumo は**起動したディレクトリで
そのまま claude を起こす**。セッションを分けたいときは、分かれた作業ツリーで tsukumo を
起こす。

撤去したのは次の5つ（当時の検討は `docs/history/direction.md` の 2026-09-22 にある）:

- 起動時に `.git/tsukumo/worktree/<時刻>` を切り、`cwd` をそちらへ向ける（`prepareWorkspace`）
- 使い終えた worktree を起動時に畳む・畳めなかったものを1行知らせる
- 1タスクぶんの成果を切り出し元へマージする（`mergeWorkspace`）と、その知らせ
  （`workspaceNotices`）
- 着手の印（`.git/tsukumo/claim/<タスクid>`）と、それを取る・返す `claim` / `finish` のツール
- 画面の `workspace`（帯のブランチの読み・部屋の名前の `title` のパス・サイドバーの知らせ）

**残したのは続きのセッションの探し方だけ**（`listSessions` に `includeWorktrees: true` を渡し、
`getSessionMessages` はディレクトリで絞らない）。**orca が worktree を切るなら起こすたびに
ディレクトリが変わるのは同じ**で、作業ディレクトリだけで絞ると前の続きが見つからなくなる。
鍵は「印（`tsukumo:<パック>@<ポート>`）」のままで、`docs/requirements.md` 4.8 も変わらない。
