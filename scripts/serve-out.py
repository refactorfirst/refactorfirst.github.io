#!/usr/bin/env python3
"""Serve the Next.js static export (out/) with GitHub Pages semantics:
- directories redirect to a trailing slash and serve their index.html
- unknown paths serve out/404.html with HTTP 404 status

Usage: python3 scripts/serve-out.py [outDir] [port] [basePath]
Defaults: outDir=out, port=8003, basePath='' (serve at root).
"""
import http.server
import socketserver
import os
import sys

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else 'out'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8003
BASE_PATH = sys.argv[3].strip('/') if len(sys.argv) > 3 else ''


class ExportHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=OUT_DIR, **kwargs)

    def serve_file(self, fs_path, status=200):
        try:
            with open(fs_path, 'rb') as contents:
                self.send_response(status)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(os.path.getsize(fs_path)))
                self.end_headers()
                self.copyfile(contents, self.wfile)
        except OSError:
            self.send_error(404, 'File not found')

    def do_GET(self):
        path, sep, query = self.path.partition('?')
        strip = len(BASE_PATH) + 1
        if BASE_PATH:
            if not (path == '/' + BASE_PATH or path.startswith('/' + BASE_PATH + '/')):
                self.send_error(404, 'Outside base path')
                return
            path = path[strip:] or '/'
            # Rewriting self.path keeps super().do_GET() (file branch) and
            # translate_path operating on the stripped path.
            self.path = path + (sep + query if sep else '')
        fs_path = self.translate_path(path)
        if os.path.isdir(fs_path) and os.path.isfile(os.path.join(fs_path, 'index.html')):
            if not path.endswith('/'):
                self.send_response(301)
                prefix = ('/' + BASE_PATH) if BASE_PATH else ''
                self.send_header('Location', prefix + path + '/' + (sep and '?' + query or ''))
                self.end_headers()
                return
            self.serve_file(os.path.join(fs_path, 'index.html'))
        elif os.path.isfile(fs_path):
            super().do_GET()
        else:
            # Unknown path -> app 404 page (GitHub Pages parity)
            self.serve_file(os.path.join(OUT_DIR, '404.html'), status=404)


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), ExportHandler) as httpd:
        print(f'Serving {OUT_DIR} at http://localhost:{PORT}/' + (f'{BASE_PATH}/' if BASE_PATH else ''))
        httpd.serve_forever()
