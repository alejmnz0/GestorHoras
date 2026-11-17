# Genera los iconos de la aplicación (build/icon.ico, icon.png, tray.png, tray.ico).
from PIL import Image, ImageDraw
import math

def draw_icon(size, rounded=True):
    S = size * 4  # supermuestreo para bordes suaves
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * 0.22) if rounded else S // 2
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=(37, 99, 235, 255))
    # esfera
    c = S / 2
    R = S * 0.32
    w = max(4, int(S * 0.065))
    d.ellipse([c - R, c - R, c + R, c + R], outline=(255, 255, 255, 255), width=w)
    # marcas de 12/3/6/9
    for a in range(0, 360, 90):
        rad = math.radians(a)
        x1, y1 = c + math.sin(rad) * R * 0.72, c - math.cos(rad) * R * 0.72
        x2, y2 = c + math.sin(rad) * R * 0.86, c - math.cos(rad) * R * 0.86
        d.line([x1, y1, x2, y2], fill=(255, 255, 255, 255), width=max(2, w // 2))
    # agujas (10:10 aprox → minutero a las 12, horario a las 3 ≈ "imputa")
    d.line([c, c, c, c - R * 0.58], fill=(255, 255, 255, 255), width=w)
    d.line([c, c, c + R * 0.42, c + R * 0.12], fill=(255, 255, 255, 255), width=w)
    dot = w * 0.9
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=(255, 255, 255, 255))
    # punto verde (jornada completada)
    gr = S * 0.11
    gx, gy = S * 0.80, S * 0.20
    d.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=(34, 197, 94, 255), outline=(255, 255, 255, 255), width=max(2, int(S * 0.025)))
    return img.resize((size, size), Image.LANCZOS)

big = draw_icon(256)
big.save('build/icon.png')
big.save('build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
tray = draw_icon(64)
tray.resize((32, 32), Image.LANCZOS).save('build/tray.png')
tray.save('build/tray.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48)])
# Linux: iconos en todos los tamaños estándar (electron-builder los instala en hicolor).
import os
os.makedirs('build/icons', exist_ok=True)
hi = draw_icon(512)
for size in (16, 24, 32, 48, 64, 128, 256, 512):
    (hi if size == 512 else hi.resize((size, size), Image.LANCZOS)).save(f'build/icons/{size}x{size}.png')
print('iconos generados')
