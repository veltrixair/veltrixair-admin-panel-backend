import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseShape {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let data: unknown = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse !== null) {
        const source = errorResponse as ErrorResponseShape &
          Record<string, unknown>;
        const { message: raw, error } = source;

        // Everything except the three envelope-level fields is caller context.
        const details = Object.fromEntries(
          Object.entries(source).filter(
            ([key]) => !['message', 'error', 'statusCode'].includes(key),
          ),
        );

        if (Array.isArray(raw)) {
          message = 'Validation failed';
          data = raw;
        } else {
          if (typeof raw === 'string') {
            message = raw;
          } else if (error) {
            message = error;
          }
          // Anything the thrower attached beyond message/error is context the
          // caller needs — a blackout clash carries the bookings that blocked
          // it, for instance. Dropping it would leave the client knowing only
          // that something failed.
          if (Object.keys(details).length > 0) {
            data = details;
          }
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
