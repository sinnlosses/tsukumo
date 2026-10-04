# `capture-catalog.ts` で、レポートの `image` の塊が読める画像のまま撮れるようにする（振り返り: GH-339）

- 札: 黄 道具（21回目）
- 根: capture-catalog-image-unreadable
- 根拠: `capture-catalog.ts` は tsukumo をリポジトリの根で起こすので、`image` の塊は必ず「画像を出せない」の札で撮れる。GH-339 では読める画像を撮るため使い捨ての `/tmp/gh-339/shoot.ts` を5回直し、その中でツールのエラーが4件出た（hook の `deny-sed-in-place` に `copyFileSync` を止められた・ブラウザの起動で1回落ちた）。後段の GH-340（Before → After の塊）・GH-338（質問の `preview` の画像）も画像を撮る
- 出し先: タスク。`scripts/capture-catalog.ts` の場面に「画像を棚に置いてから起こす」準備を足し、`report-image` の場面で読める画像と読めない画像を両方撮れるようにする。GH-340 の着手前に入れると、そのタスクの撮影が使い捨てのスクリプト無しで済む
