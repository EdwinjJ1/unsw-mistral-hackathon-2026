import { NextResponse } from 'next/server';
import { extractDocuments, isSupportedDocument } from '@/lib/document-files';
import { ingestDocumentSet } from '@/lib/ingest';

export const runtime = 'nodejs';

const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((item): item is File => item instanceof File);
    const paths = form.getAll('paths').map(String);
    const replace = form.get('replace') !== 'false';
    if (!files.length) return NextResponse.json({ error: 'No files supplied' }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Maximum ${MAX_FILES} files` }, { status: 413 });
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_BYTES) return NextResponse.json({ error: 'Dataset exceeds 30 MB' }, { status: 413 });

    const inputs = await Promise.all(
      files
        .map((file, index) => ({ file, name: paths[index] || file.name }))
        .filter(({ name }) => isSupportedDocument(name))
        .map(async ({ file, name }) => ({
          name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
    );
    const { documents, errors } = await extractDocuments(inputs);
    if (!documents.length) {
      return NextResponse.json({
        error: errors.length
          ? `No readable documents were found. ${errors.slice(0, 3).join(' | ')}`
          : 'No readable documents were found in the selected files.',
        parseWarnings: errors,
      }, { status: 422 });
    }
    const result = await ingestDocumentSet({
      documents,
      sourceName: `uploaded dataset (${documents.length} documents)`,
      replace,
    });
    return NextResponse.json({ ...result, fileCount: documents.length, parseWarnings: errors });
  } catch (error) {
    console.error('Dataset upload failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dataset upload failed' },
      { status: 500 },
    );
  }
}
