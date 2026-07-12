# おとむすび（NOCTUNE fork）

聴いて当てるだけの耳トレ Web アプリ。  
既存の [みみクエスト](https://github.com/ngmt4amtk-web/violin-ear-quest) は残した別アプリ。

## モード

1. 音当て
2. 和音当て（2和音 / 3和音）
3. 音程比較
4. ハモリ判定

レベルアップなし。ベスト記録とれんぞく日数だけ。

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
- 正解／ハズレは短い快感SFX（刺激音のあと）
