# `capture-catalog.ts --only diary-book` が見開きの中身を撮れるようにし、読み込み中のまま撮ったら落とす（振り返り: GH-164）

- 札: 黄 道具（9回目）
- 根拠: GH-164 の撮り比べで `node scripts/capture-catalog.ts --only diary-book` を3回撮ったが、変更前（`serve-revision.ts` の取り出し先で走らせた分を含む）も変更後も、見開きの中が「…」のまま写った。本文・灯りの字・時刻の字・立ち絵が写らず、完了条件の目視が単体テストの裏付けだけで閉じた。件の `settle` は `TAIL_SETTLE` で、中身が出たかを待たずに撮る
- 出し先: `scripts/capture-catalog.ts` の `diary-book` の件。見開きの中身が出る原因を直し、`settle` を本文の要素のセレクタ待ちにして、上限まで出なければ撮らずに落とす（黙って読み込み中の画を撮らない）。後段の GH-167・GH-173 も日記帳の見開きの目視を使う
