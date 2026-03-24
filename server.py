import http.server
import socketserver
import json
import os
import urllib.parse

PORT = 8081  # Default to 8081 to match user preference
DATA_FILE = "nexus_data.json"
NOTES_DIR = os.path.join(os.path.dirname(__file__), "移动开发相关知识总结")
INTERVIEW_DIR = os.path.join(os.path.dirname(__file__), "面试题库")

class NexusHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, status_code, text, content_type):
        body = text.encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-type', f'{content_type}; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _extract_title(self, markdown_text, fallback):
        for raw_line in markdown_text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith('#'):
                return line.lstrip('#').strip() or fallback
            break
        return fallback

    def _list_markdown_files(self, root_dir):
        if not os.path.isdir(root_dir):
            return []

        files = []
        for filename in os.listdir(root_dir):
            if not filename.lower().endswith('.md'):
                continue
            full_path = os.path.join(root_dir, filename)
            if not os.path.isfile(full_path):
                continue
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                title = self._extract_title(content, filename)
            except Exception:
                title = filename
            files.append({'name': filename, 'title': title})

        files.sort(key=lambda x: x['name'])
        return files

    def _read_markdown_file(self, root_dir, name):
        name = os.path.basename(urllib.parse.unquote(name or ''))
        if not name or not name.lower().endswith('.md'):
            return None, 'invalid_name'

        full_path = os.path.abspath(os.path.join(root_dir, name))
        root_abs = os.path.abspath(root_dir)
        if not full_path.startswith(root_abs + os.sep) and full_path != root_abs:
            return None, 'invalid_path'

        if not os.path.isfile(full_path):
            return None, 'not_found'

        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            return None, 'read_failed'

        title = self._extract_title(content, name)
        return {'name': name, 'title': title, 'content': content}, None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b'{}')
        elif parsed.path == '/api/notes/list':
            self._send_json(200, {'files': self._list_markdown_files(NOTES_DIR)})
        elif parsed.path == '/api/notes/file':
            query = urllib.parse.parse_qs(parsed.query)
            name = (query.get('name') or [''])[0]
            payload, err = self._read_markdown_file(NOTES_DIR, name)
            if err == 'invalid_name' or err == 'invalid_path':
                self._send_json(400, {'error': err})
                return
            if err == 'not_found':
                self._send_json(404, {'error': err})
                return
            if err:
                self._send_json(500, {'error': err})
                return
            self._send_json(200, payload)
        elif parsed.path == '/api/interview/list':
            self._send_json(200, {'files': self._list_markdown_files(INTERVIEW_DIR)})
        elif parsed.path == '/api/interview/file':
            query = urllib.parse.parse_qs(parsed.query)
            name = (query.get('name') or [''])[0]
            payload, err = self._read_markdown_file(INTERVIEW_DIR, name)
            if err == 'invalid_name' or err == 'invalid_path':
                self._send_json(400, {'error': err})
                return
            if err == 'not_found':
                self._send_json(404, {'error': err})
                return
            if err:
                self._send_json(500, {'error': err})
                return
            self._send_json(200, payload)
        else:
            super().do_GET()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ['/api/data', '/api/notes/list', '/api/notes/file', '/api/interview/list', '/api/interview/file']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
        else:
            super().do_HEAD()

    def do_POST(self):
        if self.path == '/api/save':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                # Validate JSON
                json_data = json.loads(post_data.decode('utf-8'))
                
                # Save to file
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Data saved to disk"}')
                print(f"Successfully saved data to {DATA_FILE}")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_msg = f'{{"status": "error", "message": "{str(e)}"}}'
                self.wfile.write(error_msg.encode('utf-8'))
                print(f"Error saving data: {e}")
        else:
            self.send_error(404)

class NexusServer(socketserver.TCPServer):
    allow_reuse_address = True

print(f"Starting Nexus Server on port {PORT}...")
print(f"Open http://localhost:{PORT} in your browser.")
with NexusServer(("", PORT), NexusHandler) as httpd:
    httpd.serve_forever()
