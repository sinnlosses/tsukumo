# 成果が「数えられない・読めない」ときの出し方を1か所にだけ書き、ほかの文書は節の名前で指す（振り返り: GH-389）

- 札: 黄 文書の重さ（3回目）
- 根: achievement-behavior-restated
- 根拠: GH-389 で、git や Beads が読めないときの成果の出し方を `docs/requirements.md` 4.11・`docs/architecture.md`・`docs/architecture/screen-design.md` 13.10 の3か所で直した。委譲先は前の2つと 13.10 の数の札だけを直し、13.10 の暦の節と「空の日・数えられないとき」の表の2か所を古いまま残した。受け入れのレビューで1往復差し戻した。同じ根の機械の出来事の写しには GH-407 がある
- 出し先: 3回目なので仕組みで塞ぐ。「どの読みが欠けたら何を出すか」の表を `docs/requirements.md` 4.11 の1か所にだけ置き、`docs/architecture.md`・`screen-design.md` 13.10 の写しは節の名前への参照に畳むタスクにする。あわせて、場面の名前（「`main` も Beads も読めない」など）が正典の外の文書に書かれていたら `node scripts/find-stray-reference.ts` と同じ段で落とす検査を足す
