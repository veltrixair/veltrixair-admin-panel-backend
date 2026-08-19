import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface MulterError extends Error {
  code?: string;
  field?: string;
}

/**
 * Multer rejects oversized or malformed uploads before any controller runs, and
 * its errors would otherwise surface as bare 500s outside the standard
 * envelope. This translates the ones a caller can act on.
 */
@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  private static readonly MESSAGES: Record<string, string> = {
    LIMIT_FILE_SIZE: 'That file is larger than this endpoint accepts',
    LIMIT_FILE_COUNT: 'Too many files in one request',
    LIMIT_UNEXPECTED_FILE:
      'Unexpected upload field — the file must be sent as "file"',
    LIMIT_PART_COUNT: 'Too many parts in the multipart request',
    LIMIT_FIELD_KEY: 'A field name in the upload is too long',
    LIMIT_FIELD_VALUE: 'A field value in the upload is too long',
  };

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const error = exception as MulterError;
    const known = error?.code
      ? MulterExceptionFilter.MESSAGES[error.code]
      : undefined;

    // Anything that isn't a multer limit is not ours to reinterpret.
    if (!known) throw exception;

    response.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      statusCode: HttpStatus.BAD_REQUEST,
      message: known,
      data: { code: error.code },
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
