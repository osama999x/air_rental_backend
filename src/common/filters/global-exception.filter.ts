import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    this.logger.error(`${exception?.name || 'Error'}: ${exception?.message || 'Unknown error'}`);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || message;
    } else if (exception instanceof QueryFailedError) {
      const error = this.handleDatabaseError(exception);
      status = error.statusCode;
      message = error.message;
    } else if (exception instanceof AppError) {
      status = exception.statusCode;
      message = exception.message;
    } else if (exception?.code === 'ER_DUP_ENTRY' || exception?.errno === 1062) {
      status = HttpStatus.CONFLICT;
      message = 'A record with this value already exists';
    } else if (exception?.code === '23505') {
      // Duplicate key error
      const error = this.handleDuplicateFieldsDB(exception);
      status = error.statusCode;
      message = error.message;
    } else if (exception?.code === '23503') {
      // Foreign key violation
      message = 'Invalid foreign key reference';
      status = HttpStatus.BAD_REQUEST;
    } else if (exception?.code === '23502') {
      // Not null violation
      message = this.handleNullConstraintError(exception);
      status = HttpStatus.BAD_REQUEST;
    } else if (exception?.code === '22P02') {
      // Invalid input syntax
      message = this.handleInvalidInput(exception);
      status = HttpStatus.BAD_REQUEST;
    } else if (exception?.message) {
      message = exception.message;
    }

    const responsePayload = {
      status: 'error',
      message: message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(responsePayload);
  }

  private handleDatabaseError(error: QueryFailedError): {
    statusCode: number;
    message: string;
  } {
    const errorMessage = (error as any).message || '';

    if (errorMessage.includes('duplicate key')) {
      return this.handleDuplicateFieldsDB(error);
    }

    if (errorMessage.includes('value too long')) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'A name or file name is too long. Use a shorter name and try again.',
      };
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Database operation failed',
    };
  }

  private handleDuplicateFieldsDB(error: any): {
    statusCode: number;
    message: string;
  } {
    if (error.detail) {
      const match = error.detail.match(/\((.*?)\)/);
      if (match && match[1]) {
        const field = match[1];
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: `${field} already exists`,
        };
      }
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Duplicate entry found',
    };
  }

  private handleNullConstraintError(error: any): string {
    if (error.detail) {
      const match = error.detail.match(/\((.*?)\)/);
      if (match && match[1]) {
        return `${match[1]} cannot be null`;
      }
    }
    return 'Required field is missing';
  }

  private handleInvalidInput(error: any): string {
    const invalidValueMatch = error.message?.match(
      /invalid input syntax for type (\w+): "(.*)"/,
    );

    if (invalidValueMatch) {
      const invalidType = invalidValueMatch[1];
      const invalidValue = invalidValueMatch[2];

      switch (invalidType.toLowerCase()) {
        case 'uuid':
          return `Invalid UUID provided: ${invalidValue}`;
        case 'integer':
        case 'int':
        case 'number':
          return `Invalid number provided: ${invalidValue}`;
        case 'date':
        case 'datetime':
        case 'timestamp':
          return `Invalid date provided: ${invalidValue}`;
        default:
          return `Invalid ${invalidType} value provided: ${invalidValue}`;
      }
    }

    return 'Invalid input provided';
  }
}

