# Draws the Chrome Web Store small promo tile (440x280) into docs/store/promo-440x280.png.
# Run with: python3 -I scripts/make-promo.py
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 440, 280
img = Image.new('RGB', (W, H), (247, 248, 250))
d = ImageDraw.Draw(img)
d.rectangle((0, 0, W, 6), fill=(3, 112, 189))
icon = Image.open(os.path.join(ROOT, 'public', 'images', 'icon128.png')).convert('RGBA').resize((96, 96), Image.LANCZOS)
img.paste(icon, (32, 52), icon)
bold = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf', 30)
reg = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', 15)
d.text((146, 58), 'Data Cloud', font=bold, fill=(26, 31, 43))
d.text((146, 94), 'Inspector', font=bold, fill=(26, 31, 43))
lines = ['Profiles, identity resolution, segments,', 'SQL and the data model of your', 'Salesforce Data Cloud org. Read only.']
for i, line in enumerate(lines):
    d.text((32, 176 + i * 22), line, font=reg, fill=(70, 78, 92))
img.save(os.path.join(ROOT, 'docs', 'store', 'promo-440x280.png'))
print('saved')
