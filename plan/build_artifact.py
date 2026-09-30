"""Собирает plan/ в один HTML-файл (фото и скрипты внутри) для публикации как артефакт.
Запуск: python3 plan/build_artifact.py <куда_записать.html>"""
import base64, re, sys, pathlib
d = pathlib.Path(__file__).parent
h = (d / 'index.html').read_text()
body = h[h.index('<header'):h.index('<script src="https://cdn.jsdelivr.net/npm/three')]
libs = re.findall(r'<script src="https://cdn\.jsdelivr\.net[^>]*></script>', h)
data = (d / 'data.js').read_text()
b64 = base64.b64encode((d / 'photo.jpg').read_bytes()).decode()
data = data.replace("'photo.jpg'", "'data:image/jpeg;base64," + b64 + "'", 1)
out = ("<title>План 3 этажа</title>\n<style>\n" + (d / 'style.css').read_text() + "\n</style>\n" + body + "\n" +
       "\n".join(libs) + "\n<script>\n" + data + "\n</script>\n<script>\n" + (d / 'plan.js').read_text() +
       "\n</script>\n<script>\n" + (d / 'plan3d.js').read_text() + "\n</script>\n")
pathlib.Path(sys.argv[1]).write_text(out)
print(len(out))
