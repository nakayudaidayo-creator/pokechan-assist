"""SPから実数値を出す式が、ゲームの表示と一致するかを確かめる。

式(レベル50・個体値は最大扱い):
  HP     = floor((2*種族値 + 31) / 2) + 60 + SP
  その他 = floor((floor((2*種族値 + 31) / 2) + 5 + SP) * 性格補正)
SPは1つの能力に最大32、合計66。
"""
import json
import sys
from pathlib import Path

NATURES = {
    "わんぱく": ("def", "spa"), "ひかえめ": ("spa", "atk"), "おくびょう": ("spe", "atk"),
    "いじっぱり": ("atk", "spa"), "ようき": ("spe", "spa"),
}


def calc(base, sp, key, nature):
    core = (2 * base + 31) // 2
    if key == "hp":
        return core + 60 + sp
    up, down = NATURES.get(nature, (None, None))
    mult = 1.1 if key == up else 0.9 if key == down else 1.0
    return int((core + 5 + sp) * mult)


def main():
    party = json.loads((Path(__file__).parent.parent / "Data" / "party.json").read_text(encoding="utf-8"))
    ng = 0
    for m in party["members"]:
        total = sum(m["sp"].values())
        for key, shown in m["stats"].items():
            got = calc(m["base"][key], m["sp"][key], key, m["nature"])
            if got != shown:
                ng += 1
                print(f"NG {m['species']} {key}: 計算{got} 表示{shown}")
        print(f"{m['species']}: SP合計{total}")
    print("全一致" if ng == 0 else f"不一致 {ng}件")
    sys.exit(1 if ng else 0)


if __name__ == "__main__":
    main()
