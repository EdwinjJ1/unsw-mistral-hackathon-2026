import { ValidationError } from './validation';

interface ErrorWithCode {
  code?: unknown;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as ErrorWithCode).code;
  return typeof code === 'string' ? code : undefined;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('request body must be valid JSON');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  const code = errorCode(error);
  if (code?.startsWith('SQLITE_CONSTRAINT')) {
    return Response.json(
      { error: 'Delta violates graph integrity constraints' },
      { status: 422 },
    );
  }

  console.error('Unhandled API error.', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
