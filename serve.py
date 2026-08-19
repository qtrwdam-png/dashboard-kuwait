import http.server
import socketserver
import os
import gzip
import json
from io import BytesIO

ROOT = os.path.dirname(os.path.abspath(__file__))

# صفحات المنتجات الديناميكية + sitemap (SEO) — اختياري عند غياب الوحدة
PP_ERROR = None
try:
    import product_page
except Exception as exc:
    product_page = None
    PP_ERROR = repr(exc)
    print('product_page import FAILED: %r' % exc, flush=True)

APP_VERSION = 'seo-v2'

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

        # فحص صحة الإصدار المنشور (لتشخيص النشر)
        if path == '/healthz':
            body = json.dumps({'version': APP_VERSION,
                               'product_page': product_page is not None,
                               'product_page_error': PP_ERROR}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if with_body:
                self.wfile.write(body)
            return

        # لوحة التحكم: /admin و /admin/...
        if path == '/admin' or path == '/admin/':
            return self._serve('/admin/index.html', with_body)
        if path.startswith('/admin/'):
            full = os.path.join(ROOT, path.lstrip('/'))
            if os.path.exists(full):
                return self._serve(path, with_body)
            return self._serve('/admin/index.html', with_body)

        # خريطة الموقع الديناميكية (تشمل صفحات كل المنتجات الحالية)
        if path == '/sitemap.xml' and product_page:
            try:
                xml = product_page.render_sitemap_xml(product_page.get_products())
                return self._serve_dynamic(xml, 'application/xml; charset=utf-8', with_body)
            except Exception:
                pass  # عند الفشل يُقدَّم الملف الثابت كاحتياط

        # ملف منتجات Google Merchant Center
        if path == '/feed.xml' and product_page:
            return self._serve_dynamic(product_page.render_feed_xml(product_page.get_products()),
                                       'application/rss+xml; charset=utf-8', with_body)

        # صفحة أسعار اليوم
        if path == '/prices' and product_page:
            return self._serve_dynamic(product_page.render_prices_html(product_page.get_products()),
                                       'text/html; charset=utf-8', with_body)

        # صور المنتجات المضمّنة (data URI) تُقدَّم كملفات: /product-img/<id>
        if path.startswith('/product-img/') and product_page:
            pid = path.split('/')[2] if len(path.split('/')) > 2 else ''
            product = product_page.get_product(pid) if pid else None
            decoded = product_page.get_data_image(product) if product else None
            if decoded:
                ctype, blob = decoded
                self.send_response(200)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(blob)))
                self.send_header('Cache-Control', 'public, max-age=300')
                self.end_headers()
                if with_body:
                    self.wfile.write(blob)
                return
            self.send_error(404, 'Not found')
            return

        # صفحات المنتجات الديناميكية: /product/<id> أو /product/<id>/<slug>
        if path.startswith('/product/') and product_page:
            pid = path.split('/')[2] if len(path.split('/')) > 2 else ''
            product = product_page.get_product(pid) if pid else None
            if product:
                html = product_page.render_product_html(product, product_page.get_products())
                return self._serve_dynamic(html, 'text/html; charset=utf-8', with_body)
            return self._serve_dynamic(product_page.render_not_found_html(),
                                       'text/html; charset=utf-8', with_body, status=404)

        # موقع العملاء: ملفات حقيقية، وإلا index.html
        if path == '/':
            return self._serve('/index.html', with_body)
        full = os.path.join(ROOT, path.lstrip('/'))
        if os.path.exists(full):
            return self._serve(path, with_body)
        return self._serve('/index.html', with_body)

    def _serve_dynamic(self, text, ctype, with_body=True, status=200):
        """يخدم محتوى مولّداً ديناميكياً (HTML/XML) مع gzip وكاش قصير."""
        content = text.encode('utf-8')
        gzipped = None
        if 'gzip' in self.headers.get('Accept-Encoding', ''):
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6, mtime=0) as gz:
                gz.write(content)
            gz_data = buf.getvalue()
            if len(gz_data) < len(content):
                gzipped = gz_data
        body = gzipped if gzipped is not None else content
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        # كاش 5 دقائق: سرعة للزوار + حماية لحصة Firestore
        self.send_header('Cache-Control', 'public, max-age=300')
        if gzipped is not None:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        if with_body:
            self.wfile.write(body)

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
    port = int(os.environ.get('PORT', 12001))
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'المشروع المدمج يعمل على المنفذ :{port}')
        print(f'  موقع العملاء:  http://localhost:{port}/')
        print(f'  لوحة التحكم:   http://localhost:{port}/admin/')
        httpd.serve_forever()
