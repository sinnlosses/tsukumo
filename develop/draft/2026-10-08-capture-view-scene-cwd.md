# capture-view の --scene で起動先（cwd）を指せるようにする（振り返り: GH-493）

- 観点: 黄 道具の経済
- 根拠: GH-493 の委譲先が `.beads` のある起動先と無い起動先でタスクの節の出し分けを撮ろうとしたが、`scripts/capture-view.ts` の `--scene` は起動先を作業ツリーの根（`repositoryRoot()`）に決め打ちしていて切り替えられなかった。スクラッチに自前の起動スクリプトを書いて疑似セッションを2つ起こし、その URL を `capture-view` に渡して撮った（friction log の黄1件）
- 出し先: `scripts/capture-view.ts` に `--scene` と一緒に使う `--cwd <dir>`（疑似セッションを起こす起動先）を足し、`docs/architecture/testing.md`「手で確かめること」に、起動先ごとの出し分け（`.beads` の有無・課題ファイルの有無）を撮るときの使い方を1行で書く
