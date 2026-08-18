import http.server
import socketserver
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        path = self.path.split('?', 1)[0]

        # لوحة التحكم: /admin و /admin/...
        if path == '/admin' or path == '/admin/':
            self.path = '/admin/index.html'
            return super().do_GET()
        if path.startswith('/admin/'):
            full = os.path.join(ROOT, path.lstrip('/'))
            if os.path.exists(full):
                return super().do_GET()
            # SPA fallback للوحة التحكم
            self.path = '/admin/index.html'
            return super().do_GET()

        # موقع العملاء: ملفات حقيقية، وإلا index.html
        if path == '/':
            self.path = '/index.html'
            return super().do_GET()
        full = os.path.join(ROOT, path.lstrip('/'))
        if os.path.exists(full):
            return super().do_GET()
        # fallback لموقع العملاء
        self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    port = 12001
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'المشروع المدمج يعمل على المنفذ :{port}')
        print(f'  موقع العملاء:  http://localhost:{port}/')
        print(f'  لوحة التحكم:   http://localhost:{port}/admin/')
        httpd.serve_forever()
