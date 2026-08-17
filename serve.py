import http.server
import socketserver
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        full = os.path.join(ROOT, path.lstrip('/'))
        # Serve real files as-is; SPA fallback to index.html for client-side routes
        if path == '/' or not os.path.exists(full):
            self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    port = 12000
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'serving {ROOT} on :{port}')
        httpd.serve_forever()
