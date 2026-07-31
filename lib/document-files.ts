import 'server-only';

import { parseOffice, type SupportedFileType } from 'officeparser';

export interface DocumentInput {
  name: string;
  bytes: Uint8Array;
}
export interface ExtractedDocument {
  name: string;
  text: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'log',
]);
const OFFICE_EXTENSIONS = new Set([
  'pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'epub',
]);

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
]);

export function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isSupportedDocument(name: string) {
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(extensionOf(name));
}

export async function extractDocument(input: DocumentInput): Promise<ExtractedDocument> {
  const extension = extensionOf(input.name);
  if (!isSupportedDocument(input.name)) {
    throw new Error(`Unsupported document type: ${input.name}`);
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      name: input.name,
      text: new TextDecoder().decode(input.bytes).trim(),
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const ast = await parseOffice(Buffer.from(input.bytes), {
      fileType: extension as SupportedFileType,
      abortSignal: controller.signal,
      ignoreComments: false,
      ignoreNotes: false,
      ignoreHeadersAndFooters: true,
      ignoreSlideMasters: true,
      includeRawContent: false,
    });
    return { name: input.name, text: ast.toText().trim() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractDocuments(inputs: DocumentInput[]) {
  const documents: ExtractedDocument[] = [];
  const errors: string[] = [];
  for (const input of inputs) {
    try {
      const document = await extractDocument(input);
      if (document.text) documents.push(document);
    } catch (error) {
      errors.push(`${input.name}: ${error instanceof Error ? error.message : 'could not parse'}`);
    }
  }
  return { documents, errors };
}
