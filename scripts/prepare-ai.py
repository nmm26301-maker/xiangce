#!/usr/bin/env python3
"""Fetch pinned upstream release at build time; never downloads code on the phone."""
import argparse
import hashlib
import json
import pathlib
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'third_party/embedded-ai/manifest.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=pathlib.Path)
args = parser.parse_args()

def valid(path, digest):
    return path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest

if not all(valid(root / a['path'], a['sha256']) for a in manifest['assets']):
    archive = args.archive or root / 'build/ai-source/RealSR-1.13.2.apk'
    if not valid(archive, manifest['sha256']):
        if args.archive:
            raise SystemExit('Source APK checksum mismatch')
        archive.parent.mkdir(parents=True, exist_ok=True)
        temporary = archive.with_suffix('.download')
        urllib.request.urlretrieve(manifest['url'], temporary)
        if not valid(temporary, manifest['sha256']):
            temporary.unlink()
            raise SystemExit('Downloaded source APK checksum mismatch')
        temporary.replace(archive)
    with zipfile.ZipFile(archive) as z:
        for a in manifest['assets']:
            data = z.read(a['entry'])
            if hashlib.sha256(data).hexdigest() != a['sha256']:
                raise SystemExit('Embedded asset checksum mismatch: ' + a['entry'])
            dest = root / a['path']
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
print('Bundled AI engine and model checksums verified.')
