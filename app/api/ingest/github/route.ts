import { NextResponse } from 'next/server';
import { extractDocuments, isSupportedDocument } from '@/lib/document-files';
import { ingestDocumentSet } from '@/lib/ingest';

export const runtime = 'nodejs';

interface GitTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}
function parseGitHubTreeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('Only github.com dataset URLs are supported.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 5 || parts[2] !== 'tree') throw new Error('Use a GitHub folder URL containing /tree/branch/path.');
  const [owner, repo, , branch, ...folderParts] = parts;
  return { owner, repo: repo.replace(/\.git$/, ''), branch, folder: folderParts.join('/') };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; replace?: boolean };
    if (!body.url || body.url.length > 500) return NextResponse.json({ error: 'A GitHub dataset URL is required' }, { status: 400 });
    const { owner, repo, branch, folder } = parseGitHubTreeUrl(body.url);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Athena-document-ingest' };
    const treeResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers, cache: 'no-store' },
    );
    if (!treeResponse.ok) throw new Error(`GitHub dataset lookup failed (${treeResponse.status})`);
    const tree = (await treeResponse.json()) as { tree?: GitTreeItem[] };
    const candidates = (tree.tree ?? []).filter(
      (item) =>
        item.type === 'blob' &&
        item.path.startsWith(`${folder}/`) &&
        isSupportedDocument(item.path) &&
        (item.size ?? 0) <= 10 * 1024 * 1024,
    );
    if (!candidates.length) throw new Error('No supported documents were found in that GitHub folder.');
    if (candidates.length > 50) throw new Error('GitHub dataset contains more than 50 supported files.');
    const inputs = await Promise.all(candidates.map(async (item) => {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${item.path.split('/').map(encodeURIComponent).join('/')}`,
        { cache: 'no-store' },
      );
      if (!raw.ok) throw new Error(`Could not download ${item.path}`);
      return { name: item.path.slice(folder.length + 1), bytes: new Uint8Array(await raw.arrayBuffer()) };
    }));
    const { documents, errors } = await extractDocuments(inputs);
    const result = await ingestDocumentSet({
      documents,
      sourceName: `github:${owner}/${repo}/${folder}`,
      replace: body.replace !== false,
    });
    return NextResponse.json({ ...result, fileCount: documents.length, parseWarnings: errors });
  } catch (error) {
    console.error('GitHub dataset ingest failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GitHub dataset ingest failed' },
      { status: 500 },
    );
  }
}
