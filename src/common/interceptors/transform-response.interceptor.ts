import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

export interface ResponseEnvelope<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T | null;
  timestamp: string;
  path: string;
  method: string;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseEnvelope<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseEnvelope<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const decoratorMessage = this.reflector.get<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((data: T): ResponseEnvelope<T> => {
        let message: string;
        let payload: unknown = data;

        if (decoratorMessage) {
          message = decoratorMessage;
        } else if (
          data &&
          typeof data === 'object' &&
          data !== null &&
          'message' in (data as object) &&
          typeof (data as unknown as { message: unknown }).message === 'string'
        ) {
          const { message: extracted, ...rest } = data as unknown as {
            message: string;
            [key: string]: unknown;
          };
          message = extracted;
          payload = Object.keys(rest).length === 0 ? null : rest;
        } else {
          message = 'Success';
        }

        return {
          success: true,
          statusCode: response.statusCode,
          message,
          data: payload as T,
          timestamp: new Date().toISOString(),
          path: request.url,
          method: request.method,
        };
      }),
    );
  }
}
