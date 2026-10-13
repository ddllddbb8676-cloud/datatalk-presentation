"""One-time, standard-library migration of the approved self-contained deck.

After migration, edit index.html, demo.html, css/, js/, and data/ directly.
No build step is needed for normal edits.
"""
from pathlib import Path
import base64, hashlib, html, json, re, sys

EXPECTED = 'd15c67f7d35f1296e9283c2dd2709419b9f7db9ec61c787805d1a3ee8a59619c'
source = Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
out = Path(sys.argv[2] if len(sys.argv) > 2 else '.')
original = source.read_bytes()
assert hashlib.sha256(original).hexdigest() == EXPECTED, 'Unexpected source; do not overwrite newer edits'
deck = original.decode('utf-8')
created = {}

def write(name, content):
    data = content.encode('utf-8') if isinstance(content, str) else content
    path = out/name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    created[name] = {'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()}

def assets(text, prefix=''):
    def replace(m):
        mime = m[1].lower()
        data = base64.b64decode(re.sub(r'\s+', '', m[2]), validate=True)
        digest = hashlib.sha256(data).hexdigest()[:16]
        if 'woff' in mime:
            ext = 'woff2' if 'woff2' in mime else 'woff'
            name = f'fonts/noto-sans-kr-{digest}.{ext}'
        elif mime.startswith('image/'):
            ext = {'jpeg':'jpg','svg+xml':'svg'}.get(mime[6:],mime[6:])
            name = f'images/image-{digest}.{ext}'
        else:
            return m[0]
        write(name,data)
        return prefix+name
    return re.sub(r'data:([\w.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)',replace,text)

def csp(text):
    def replace(m):
        policy = html.unescape(m[2])
        for directive in ['img-src','font-src','style-src','script-src']:
            policy = re.sub(r'('+directive+r'\s+)([^;]+)',lambda p:p[1]+(p[2] if "'self'" in p[2] else "'self' "+p[2]),policy)
        return m[1]+html.escape(policy,quote=True)+m[3]
    return re.sub(r'(<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content=")([^"]*)("[^>]*>)',replace,text,flags=re.I)

def styles(text, stem):
    regular, fonts = [], []
    marker = '<!-- split-styles -->'
    first = True
    def replace(m):
        nonlocal first
        (fonts if 'impact-html-embedded-fonts' in m[1] else regular).append(assets(m[2],'../'))
        result = marker if first else ''
        first = False
        return result
    text = re.sub(r'<style\b([^>]*)>(.*?)</style>',replace,text,flags=re.S|re.I)
    write(f'css/{stem}.css','\n'.join(regular))
    write(f'css/{stem}-fonts.css','\n'.join(fonts))
    return text.replace(marker,f'<link rel="stylesheet" href="css/{stem}.css">\n<link rel="stylesheet" href="css/{stem}-fonts.css">')

match = re.search(r'<script\b[^>]*id="real-ui-source"[^>]*>(.*?)</script>',deck,re.S)
assert match, 'Embedded demo not found'
demo = base64.b64decode(match[1]).decode('utf-8')
deck = deck[:match.start()] + deck[match.end():]

demo = styles(csp(demo),'demo')
demo_names = ['vendor/echarts.min.js','js/demo-dialogs.js','js/demo-visuals.js','js/demo-app.js']
demo_count = 0
def demo_script(m):
    global demo_count
    if 'application/json' in m[1]: return m[0]
    assert demo_count < len(demo_names), 'Unexpected demo script'
    name = demo_names[demo_count];demo_count += 1
    write(name,m[2])
    return f'<script src="{name}"></script>'
demo = re.sub(r'<script\b([^>]*)>(.*?)</script>',demo_script,demo,flags=re.S|re.I)
assert demo_count == 4
write('demo.html',assets(demo))

deck = styles(csp(deck),'presentation')
deck_count = 0
data_ids = {'presentation-data','synthetic-data','ui-fixture','speaker-data','complex-sql-data'}
def deck_script(m):
    global deck_count
    id_match = re.search(r'\bid="([^"]+)"',m[1])
    identifier = id_match[1] if id_match else None
    if identifier in data_ids:
        data = json.loads(m[2])
        # Keep the original DOM contract and synchronous script order.
        body = '(function(){\n  const data = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n'
        body += '  const node = document.createElement("script");\n  node.type = "application/json";\n'
        body += '  node.id = '+json.dumps(identifier)+';\n  node.textContent = JSON.stringify(data);\n  document.currentScript.replaceWith(node);\n})();\n'
        name = f'data/{identifier}.js'
        write(name,body)
        return f'<script src="{name}"></script>'
    if 'application/json' in m[1]: return m[0]
    name = ['js/presentation.js','js/review.js'][deck_count]
    deck_count += 1
    body = m[2]
    if name == 'js/review.js':
        old = "frame.srcdoc=new TextDecoder().decode(Uint8Array.from(atob($('#real-ui-source').textContent.trim()),c=>c.charCodeAt(0)));"
        assert old in body, 'Unexpected demo bootstrap'
        body = body.replace(old,"frame.src='demo.html';")
    write(name,body)
    return f'<script src="{name}"></script>'
deck = re.sub(r'<script\b([^>]*)>(.*?)</script>',deck_script,deck,flags=re.S|re.I)
assert deck_count == 2
write('index.html',assets(deck))
write('asset-manifest.json',json.dumps({'source_sha256':EXPECTED,'files':created},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(created),'index_bytes':created['index.html']['bytes'],'demo_bytes':created['demo.html']['bytes'],'total_bytes':sum(v['bytes'] for v in created.values())}))
