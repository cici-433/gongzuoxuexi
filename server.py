import http.server
import socketserver
import json
import os

PORT = 8000  # Default to 8000 for convenience
DATA_FILE = "nexus_data.json"

class NexusHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b'{}')
        else:
            super().do_GET()

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

print(f"Starting Nexus Server on port {PORT}...")
print(f"Open http://localhost:{PORT} in your browser.")
with socketserver.TCPServer(("", PORT), NexusHandler) as httpd:
    httpd.serve_forever()
