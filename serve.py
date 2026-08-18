import http.server
import socketserver
import os
import gzip
from io import BytesIO

ROOT = os.path.dirname(os.path.abspath(__file__))

# أنواع MIME دقيقة (يحل مشكلة .js يعود text/plain في بعض البيئات)
MIME = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject', '.map': 'application/json',
}
# امتدادات الملفات النصية القابلة للضغط
COMPRESSIBLE = {'.html', '.htm', '.css', '.js', '.svg', '.json', '.xml', '.txt'}
# الملفات الثابتة طويلة الأمد (تُخزّن سنة عند العميل)
STATIC_ASSETS = {'.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp',
                 '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map'}


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'  # keep-alive: اتصال واحد لكل الملفات

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def guess_type(self, path):
        return MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream')

    def do_GET(self):
        return self._handle(with_body=True)

    def do_HEAD(self):
        return self._handle(with_body=False)

    def _handle(self, with_body=True):
        path = self.path.split('?', 1)[0]

        # لوحة التحكم: /admin و /admin/...
        if path == '/admin' or path == '/admin/':
            return self._serve('/admin/index.html', with_body)
        if path.startswith('/admin/'):
            full = os.path.join(ROOT, path.lstrip('/'))
            if os.path.exists(full):
                return self._serve(path, with_body)
            return self._serve('/admin/index.html', with_body)

        # موقع العملاء: ملفات حقيقية، وإلا index.html
        if path == '/':
            return self._serve('/index.html', with_body)
        full = os.path.join(ROOT, path.lstrip('/'))
        if os.path.exists(full):
            return self._serve(path, with_body)
        return self._serve('/index.html', with_body)

    def _serve(self, url_path, with_body=True):
        """يخدم ملفاً ثابتاً مع cache ذكي + gzip للموقع (دون لوحة التحكم)."""
        fs_path = self.translate_path(url_path)
        if not os.path.exists(fs_path) or os.path.isdir(fs_path):
            self.send_error(404, 'Not found')
            return

        ext = os.path.splitext(url_path)[1].lower()
        ctype = self.guess_type(url_path)
        is_admin = url_path.startswith('/admin/') or url_path == '/admin'
        try:
            with open(fs_path, 'rb') as f:
                content = f.read()
        except Exception:
            self.send_error(403, 'Forbidden')
            return

        # 🚫 لوحة التحكم: no-store نهائي — لا كاش إطلاقاً (لحظية الأحداث)
        if is_admin:
            cache = 'no-store, no-cache, must-revalidate'
        elif ext in {'.html', '.htm'}:
            cache = 'no-cache, must-revalidate'  # صفحات HTML للموقع
        elif ext in STATIC_ASSETS:
            cache = 'public, max-age=31536000, immutable'  # ملفات ثابتة
        else:
            cache = 'no-store'

        # ضغط gzip للنصوص فقط (وليس لوحة التحكم أبداً)
        accept_enc = self.headers.get('Accept-Encoding', '')
        gzipped = None
        if (not is_admin) and (ext in COMPRESSIBLE) and ('gzip' in accept_enc):
            try:
                buf = BytesIO()
                with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6, mtime=0) as gz:
                    gz.write(content)
                gz_data = buf.getvalue()
                if len(gz_data) < len(content):
                    gzipped = gz_data
            except Exception:
                gzipped = None

        body = gzipped if gzipped is not None else content
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        if is_admin:
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        if gzipped is not None:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        if with_body:
            self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True  # خيوط خلفية لا تمنع الإغلاق


if __name__ == '__main__':
    port = 12001
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'المشروع المدمج يعمل على المنفذ :{port}')
        print(f'  موقع العملاء:  http://localhost:{port}/')
        print(f'  لوحة التحكم:   http://localhost:{port}/admin/')
        httpd.serve_forever()
