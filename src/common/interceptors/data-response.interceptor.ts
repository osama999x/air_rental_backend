import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { map, Observable } from 'rxjs';

@Injectable()
export class DataResponseInterceptor implements NestInterceptor {
  constructor(
    /**
     * Inject ConfigService
     */
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const httpContext = context.switchToHttp();
        const response = httpContext.getResponse();
        const statusCode = response.statusCode;
        if (
          data === null ||
          data === undefined ||
          typeof data !== 'object' ||
          Buffer.isBuffer(data) ||
          data instanceof Uint8Array ||
          typeof data.getStream === 'function'
        ) {
          return data;
        }

        const message = data.message;
        const payload = Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;

        return {
          statusCode,
          apiVersion: this.configService.get('appConfig.apiVersion') || '1.0.0',
          message: message || 'OK',
          data: payload,
        };
      }),
    );
  }
}
