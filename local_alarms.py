"""Local NCE reader. Authentication remains in memory, from a user-selected HAR."""
import argparse
import base64
import json
import re
import secrets
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FIBER_IDS = {'772907009', '772874247'}
NCE_HOST = 'nce-fan-bi0514.infra.orange.intra'

class NceHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        url = urllib.parse.urlsplit(request.full_url)
        if url.hostname != NCE_HOST or url.port != 31943 or url.scheme != 'https':
            raise ValueError('Destinația nu este serverul NCE autorizat.')
        return super().https_open(request)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Never forward the NCE session to another destination.
        return None

def decode_response(entry):
    content = entry['response']['content']
    text = content.get('text', '')
    if content.get('encoding') == 'base64':
        text = base64.b64decode(text).decode('utf-8')
    return json.loads(text)

def normalize(records):
    alarms = {}
    for row in records:
        aid = str(row.get('alarmId', ''))
        if aid not in FIBER_IDS or str(row.get('cleared')) != '0':
            continue
        location = row.get('moi') or ''
        values = dict(re.findall(r'\b(Frame|Slot|Port|ONUID)\b\s*=\s*(\d+)', location, re.I))
        values = {k.lower(): v for k, v in values.items()}
        if not all(k in values for k in ['frame', 'slot', 'port']):
            continue
        item = dict(id=aid, olt=row.get('meName', ''), frame=values['frame'],
                    slot=values['slot'], port=values['port'], onu=values.get('onuid'),
                    kind='LOS' if aid == '772907009' else 'ONT',
                    name=row.get('alarmName', ''), occurred=row.get('latestOccurUtc'))
        key = str(row.get('csn') or json.dumps(item, sort_keys=True))
        alarms[key] = item
    return list(alarms.values())

class Reader:
    def __init__(self, har, ca=None, allow_unverified_nce=False):
        entries = json.loads(Path(har).read_text(encoding='utf-8-sig'))['log']['entries']
        candidates = []
        for entry in entries:
            request = entry['request']
            url = urllib.parse.urlsplit(request['url'])
            if url.hostname == NCE_HOST and url.path == '/rest/fmwebsite/v1/commands':
                try:
                    payload = json.loads(request.get('postData', {}).get('text', ''))
                except ValueError:
                    continue
                if payload.get('cmd') == 1103:
                    candidates.append((entry, payload))
        if not candidates:
            raise ValueError('HAR-ul nu conține citirea alarmelor (1103).')
        entry, self.payload = candidates[-1]
        request = entry['request']
        self.url = 'https://' + NCE_HOST + ':31943/rest/fmwebsite/v1/commands?_cmd=1103'
        permitted = {'cookie', 'authorization', 'roarand', 'x-requested-with', 'origin', 'referer', 'x-csrf-token', 'x-xsrf-token'}
        self.headers = {h['name']: h['value'] for h in request['headers'] if h['name'].lower() in permitted}
        self.headers['Content-Type'] = 'application/json'
        self.context = ssl.create_default_context(cafile=ca)
        self.unverified_nce = allow_unverified_nce
        if allow_unverified_nce:
            self.context.check_hostname = False
            self.context.verify_mode = ssl.CERT_NONE
        self.opener = urllib.request.build_opener(NceHTTPSHandler(context=self.context), NoRedirect())
        self.lock = threading.Lock()
        self.snapshot = {'alarms': [], 'source': 'none', 'complete': False, 'total': 0, 'read': 0}
        # One captured page is explicitly a partial snapshot, never the full live list.
        try:
            response = decode_response(entry)['parameters']
            rows = response.get('data', [])
            self.snapshot = dict(alarms=normalize(rows), source='HAR (captură)', complete=False,
                                 total=response.get('total', 0), read=len(rows), updated=entry.get('startedDateTime'))
        except (ValueError, KeyError):
            pass

    def sync(self, max_pages=200):
        if not self.lock.acquire(blocking=False):
            raise ValueError('O preluare este deja în curs.')
        try:
            payload = json.loads(json.dumps(self.payload))
            p = payload['parameters']
            p.update(autoRefresh=False, scrollLock=False, csns=[])
            rows = []
            total = None
            complete = False
            for page in range(max_pages):
                p.update({'from': page * 55 + 1, 'to': (page + 1) * 55})
                req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), headers=self.headers, method='POST')
                with self.opener.open(req, timeout=30) as response:
                    body = json.load(response)
                params = body.get('parameters', {})
                if not isinstance(params.get('data'), list):
                    raise ValueError('Sesiunea NCE nu mai este validă sau răspunsul nu conține alarme. Exportă un HAR nou.')
                batch = params['data']
                new_total = int(params.get('total', 0))
                if total is None:
                    total = new_total
                # Avoid declaring a changing list a complete snapshot.
                if new_total != total:
                    raise ValueError('Lista s-a schimbat în timpul paginării. Reîncearcă; datele anterioare sunt păstrate.')
                rows.extend(batch)
                if (page + 1) * 55 >= total:
                    complete = len(rows) >= total
                    break
                if not batch:
                    break
            self.snapshot = dict(alarms=normalize(rows), source='NCE', complete=complete,
                                 total=total or 0, read=len(rows), updated=datetime.now(timezone.utc).isoformat(),
                                 unverifiedNce=self.unverified_nce)
            return self.snapshot
        finally:
            self.lock.release()

def serve(reader, port=8765):
    token = secrets.token_urlsafe(32)
    root = Path(__file__).resolve().parent / 'dist'
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, *args):
            pass  # Never log session headers or alarm data.

        def send_json(self, data, status=200):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def trusted(self):
            return self.headers.get('Host') == f'127.0.0.1:{port}'

        def do_GET(self):
            if not self.trusted():
                return self.send_json({'error': 'Host invalid'}, 403)
            if self.path == '/api/alarms':
                return self.send_json(dict(reader.snapshot, token=token, unverifiedNce=reader.unverified_nce))
            if self.path.startswith('/api/'):
                return self.send_json({'error': 'Not found'}, 404)
            super().do_GET()

        def do_POST(self):
            if not self.trusted() or self.headers.get('Origin') != f'http://127.0.0.1:{port}' or self.headers.get('X-Local-Token') != token:
                return self.send_json({'error': 'Request rejected'}, 403)
            if self.path != '/api/alarms/sync':
                return self.send_json({'error': 'Not found'}, 404)
            try:
                self.send_json(reader.sync())
            except urllib.error.HTTPError as error:
                message = 'Sesiunea NCE a expirat sau accesul este refuzat. Selectează un HAR nou.' if error.code in (301, 302, 303, 307, 308, 401, 403) else 'Serverul NCE nu a acceptat cererea de alarme.'
                self.send_json({'error': message}, 502)
            except urllib.error.URLError as error:
                if isinstance(error.reason, ssl.SSLCertVerificationError):
                    message = 'Certificatul NCE nu este acceptat. Configurează certificatul CA intern cu --ca. Verificarea TLS rămâne activă.'
                else:
                    message = 'NCE nu poate fi accesat. Verifică WireGuard și sesiunea NCE.'
                self.send_json({'error': message}, 502)
            except (ValueError, KeyError, TimeoutError):
                self.send_json({'error': 'Preluarea nu a fost finalizată. Sesiunea poate fi expirată sau lista schimbată. Datele anterioare sunt păstrate.'}, 502)
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'OLT ORO local: http://127.0.0.1:{port}/', flush=True)
    if reader.unverified_nce:
        print('Exceptie TLS activa numai pentru serverul NCE.', flush=True)
    print('Inchide aceasta consola pentru a opri serviciul.', flush=True)
    server.serve_forever()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--har', required=True, help='HAR local cu sesiunea NCE curentă')
    parser.add_argument('--ca', help='Certificat CA intern PEM, dacă nu este acceptat implicit')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--allow-unverified-nce', action='store_true', help='Excepție TLS numai pentru serverul NCE, fără redirecturi')
    args = parser.parse_args()
    serve(Reader(args.har, args.ca, args.allow_unverified_nce), args.port)
