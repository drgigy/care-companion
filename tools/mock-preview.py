"""Loopback-only mock preview. Overrides production config; blocks all external requests."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
import os
root=Path(__file__).resolve().parent.parent
os.chdir(root)
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; object-src 'none'")
  super().end_headers()
 def do_GET(self):
  path=unquote(urlparse(self.path).path)
  if path=='/config.js':
   data=b"export const config={mode:'demo',firebase:{},functionsRegion:'asia-south1'};"
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(data);return
  if path.startswith(('/.','/functions/','/node_modules/')) or '..' in path.split('/'):
   self.send_error(403);return
  if path=='/nursing-recorder.js': self.path='/tools/mock-recorder.js'
  if path=='/nursing-recorder-real.js': self.path='/nursing-recorder.js'
  if path=='/admin-client.js': self.path='/tools/mock-admin.js'
  super().do_GET()
print('MOCK ONLY: http://127.0.0.1:8879/tools/mock.html — external connections blocked',flush=True)
ThreadingHTTPServer(('127.0.0.1',8879),Handler).serve_forever()
