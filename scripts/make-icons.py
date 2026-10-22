# Draws the toolbar icons (a magnifier over a cloud) into public/images.
# Run with: python3 scripts/make-icons.py
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
BLUE = (3, 112, 189, 255)
WHITE = (255, 255, 255, 255)

def draw(size):
    s = 512
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=110, fill=BLUE)
    # cloud
    for box in [(70, 200, 230, 360), (150, 130, 330, 310), (260, 190, 420, 350)]:
        d.ellipse(box, fill=WHITE)
    d.rectangle((150, 260, 340, 360), fill=WHITE)
    # magnifier
    d.ellipse((250, 230, 410, 390), outline=BLUE, width=34, fill=WHITE)
    d.line((385, 365, 455, 435), fill=WHITE, width=56)
    d.line((385, 365, 455, 435), fill=BLUE, width=30)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
for n in (16, 32, 48, 128):
    draw(n).save(os.path.join(OUT, f'icon{n}.png'))
