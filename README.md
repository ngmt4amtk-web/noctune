# NOCTUNE

聴いて当てるだけの耳トレ Web アプリ。  
既存の [みみクエスト](https://github.com/ngmt4amtk-web/violin-ear-quest) は残した別アプリ。

https://ngmt4amtk-web.github.io/noctune/

## モード

1. 音当て（開放弦を基準に音名を当てる・バイオリン向け）
2. 和音当て（和声的 / フリー）
3. 音程比較
4. ハモリ判定

ベスト記録のみ。レベルアップなし。

## 起動

```bash
cd ~/Projects/noctune
python3 -m http.server 8650
# http://localhost:8650/
```

## テスト

```bash
node --test test/*.test.mjs
```

## 操作感の約束

- 再生中でも答えられる（早押し）
- 答えた瞬間・次の再生の直前に `stopAll`
- 聴くボタンに発音同期リップル
- 正解／ハズレは短い快感SFX（音当てモードではピッチ付き正誤SFXを出さない）
- 音当ては音域（7音 / 2オクターブ / バイオリン音域）だけ選ぶ。最初に4本の開放弦を一度確認し、毎問は該当弦の開放音→問題音
- 音当ては音名（C〜B）のみ答える。オクターブ番号は採点しない
- 問題数の既定は 5 問（設定で 10/20 に変更可）
