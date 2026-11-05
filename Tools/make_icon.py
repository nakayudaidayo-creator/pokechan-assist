"""アプリアイコン(1024×1024)を描く。小窓のダメージ表示(青=こちらの攻撃、橙=相手の攻撃)がモチーフ"""
import sys
from PIL import Image, ImageDraw, ImageFont

S = 1024
out = sys.argv[1] if len(sys.argv) > 1 else 'icon.png'
img = Image.new('RGB', (S, S), (20, 18, 46))
d = ImageDraw.Draw(img)

# 背景:上から下へ少しだけ明るさを変える
for y in range(S):
    t = y / S
    d.line([(0, y), (S, y)], fill=(int(30 - 12 * t), int(26 - 10 * t), int(70 - 30 * t)))

def bar(y, h, frac, light, dark, track=(46, 42, 88)):
    x0, x1 = 150, S - 150
    r = h // 2
    d.rounded_rectangle([x0, y, x1, y + h], radius=r, fill=track)
    xd = x0 + int((x1 - x0) * frac[1])
    xl = x0 + int((x1 - x0) * frac[0])
    d.rounded_rectangle([x0, y, xd, y + h], radius=r, fill=dark)
    d.rounded_rectangle([x0, y, xl, y + h], radius=r, fill=light)

# 2本のダメージバー(確実に入る分=明るい色、乱数しだいの分=暗い色)
bar(560, 110, (0.62, 0.78), (96, 165, 250), (43, 94, 168))
bar(730, 110, (0.40, 0.52), (251, 146, 60), (168, 85, 30))

# 上に大きな「%」
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 400)
text = '%'
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((S - w) / 2 - bbox[0], 120 - bbox[1]), text, font=font, fill=(245, 245, 247))

img.save(out)
print('saved', out)
