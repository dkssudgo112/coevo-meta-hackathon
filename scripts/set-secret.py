#!/usr/bin/env python3
"""Enter a credential locally without echoing it. Never pass the value as an argument."""
import getpass
import os
from pathlib import Path
import re
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
key = sys.argv[1] if len(sys.argv) == 2 else ''
if key not in {'MODEL_API_KEY'}:
    raise SystemExit('Usage: npm run secrets:set -- MODEL_API_KEY')
value = getpass.getpass(f'{key} (hidden input): ').strip()
if not value or any(c in value for c in '\r\n\x00'):
    raise SystemExit('A nonempty single-line key is required.')
target = root / '.dev.vars'
text = target.read_text() if target.exists() else (root / '.env.example').read_text()
quoted = value.replace('\\', '\\\\').replace('"', '\\"')
line = f'{key}="{quoted}"'
text = re.sub(rf'^{key}=.*$', lambda _: line, text, flags=re.M) if re.search(rf'^{key}=', text, re.M) else text + '\n' + line + '\n'
fd, name = tempfile.mkstemp(dir=root, prefix='.dev.vars.')
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as f: f.write(text)
    os.replace(name, target)
finally:
    if os.path.exists(name): os.unlink(name)
print(f'{key} saved locally; value not displayed.')
