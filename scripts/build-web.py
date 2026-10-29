from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets'
html=(assets/'index.html').read_text()
for path in ['vendor/flipbook-core.css','yearbook.css','photo-viewer.css','reader-fullscreen.css']:
 html=html.replace('<link rel="stylesheet" href="'+path+'">','<style>'+ (assets/path).read_text()+'</style>')
for path in ['vendor/flipbook-core.js','yearbook.js','custom-video.js','vendor/panzoom.min.js','photo-viewer.js','original-media.js','vendor/webgl-book.js','webgl-yearbook.js','photo-detail.js','reader-fullscreen.js']:
 code=(assets/path).read_text().replace('</script','<\\/script')
 html=html.replace('<script src="'+path+'"></script>','<script>'+code+'</script>')
source=(assets/'vendor/engine-source.json').read_text()
html=html.replace('</head>','<script>window.EMBEDDED_ENGINE_SOURCE='+json.dumps(source).replace('</script','<\\/script')+';</script></head>')
(root/'FlipYear.html').write_text(html)
print('Built self-contained web edition:',len(html.encode()),'bytes')
