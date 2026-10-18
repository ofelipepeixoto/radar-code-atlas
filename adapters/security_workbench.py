"""Original local consumer seam. No finding, database write, shell or network.
read_source must be supplied by Workbench's trusted acquisition, not a report.
The expected scope/digest must be retained outside the received report.
"""
import hashlib
import re
from urllib.parse import quote

TOOLS = {'repo_summary', 'search_symbols', 'symbol_context', 'impact_preview', 'source_excerpt'}

def consume_context(report, expected_scope, expected_digest, read_source):
    def reject():
        raise ValueError('CODE_CONTEXT_REJECTED')
    if (not isinstance(report, dict) or type(report.get('schemaVersion')) is not int or report.get('schemaVersion') != 1 or
        report.get('tool') not in TOOLS or report.get('scope') != expected_scope or
        type(expected_scope.get('repositoryId')) is not int or expected_scope['repositoryId'] <= 0 or
        not re.fullmatch(r'[0-9a-f]{40}', expected_scope.get('commit', '')) or
        not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', expected_scope.get('repository', '')) or
        not re.fullmatch(r'[0-9a-f]{64}', expected_digest) or report.get('snapshotDigest') != expected_digest or
        not callable(read_source)):
        reject()
    data = report.get('data')
    if not isinstance(data, dict):
        reject()
    citations = []
    if 'evidence' in data:
        citations.append(data['evidence'])
    if 'symbol' in data:
        if not isinstance(data['symbol'], dict):
            reject()
        citations.append(data['symbol'].get('evidence'))
    items = data.get('items', [])
    if not isinstance(items, list) or len(items) > 30:
        reject()
    for item in items:
        if not isinstance(item, dict):
            reject()
        citations.append(item.get('evidence'))
    checked = []
    for e in citations:
        if not isinstance(e, dict) or any(e.get(k) != v for k, v in expected_scope.items()):
            reject()
        path = e.get('path')
        if (not isinstance(path, str) or len(path) > 512 or not path or
            re.search(r'[\\%\x00-\x1f\x7f:]', path) or
            any(p in ('', '.', '..') or p.startswith('.') for p in path.split('/')) or
            not re.search(r'\.(py|js|jsx|mjs|ts|tsx)$', path)):
            reject()
        start, end = e.get('startLine'), e.get('endLine')
        if type(start) is not int or type(end) is not int or start < 1 or end < start or end-start >= 60:
            reject()
        source = read_source(path)
        if not isinstance(source, bytes) or len(source) > 131072:
            reject()
        sha = hashlib.sha256(source).hexdigest()
        blob = hashlib.sha1(b'blob ' + str(len(source)).encode() + b'\x00' + source).hexdigest()
        lines = source.decode('utf-8').split('\n')
        if end > len(lines):
            reject()
        text = '\n'.join(lines[start-1:end])
        if (len(text.encode()) > 8192 or sha != e.get('sourceSha256') or blob != e.get('blobSha') or
            text != e.get('text') or hashlib.sha256(text.encode()).hexdigest() != e.get('excerptSha256')):
            reject()
        url = f"https://github.com/{expected_scope['repository']}/blob/{expected_scope['commit']}/{quote(path, safe='/')}#L{start}-L{end}"
        checked.append(dict(path=path, startLine=start, endLine=end, sourceSha256=sha, text=text, url=url))
    return dict(kind='auxiliary-code-context', reviewState='unreviewed', findingCreated=False,
                scope=dict(expected_scope), snapshotDigest=expected_digest, citations=checked,
                warning='Integrity checked against supplied trusted bytes; semantic completeness and vulnerability status are not verified.')
