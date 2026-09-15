#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys

class SPAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Check if the path exists as a file
        if self.path == '/':
            self.path = '/index.html'
        
        # Construct the file path
        file_path = self.translate_path(self.path)
        
        # If the file doesn't exist, serve index.html for SPA routing
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            # Check if it's a static asset request
            if any(self.path.startswith(ext) for ext in ['/css/', '/js/', '/assets/', '/templates/']):
                self.send_error(404, "File not found")
                return
            # For all other routes, serve index.html
            self.path = '/index.html'
            file_path = self.translate_path(self.path)
        
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

if __name__ == '__main__':
    PORT = 8003
    with socketserver.TCPServer(("", PORT), SPAHTTPRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
