// モードレジストリ。ホーム表示順に3モードをまとめる（v2: おとあて・ミクロ耳・ハモリ）。
import otoAte from './oto-ate.js';
import microEar from './micro-ear.js';
import hamori from './hamori.js';

export const MODES = [otoAte, microEar, hamori];
