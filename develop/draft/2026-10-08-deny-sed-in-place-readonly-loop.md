# deny-sed-in-place が書き込みの無い for ループを拒まないようにする（振り返り: GH-467）

- 観点: 黄 機械の検査
- 根拠: GH-467 の委譲先が `git show … | grep` を回すだけの for ループを打ったところ、`scripts/deny-sed-in-place.ts` が書き込みとみなして拒み、ループを外して打ち直した（委譲先の friction log の1行）
- 出し先: `scripts/deny-sed-in-place.ts` の判定を、`sed -i` などの書き込みが実際にある場合だけ拒む形に絞るタスク。誤検知した形を単体テストに足す
