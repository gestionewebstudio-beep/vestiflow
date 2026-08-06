import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro errori globale.
 *
 * - Errori HTTP noti (4xx/5xx con HttpException): risposta originale del framework.
 * - Errori inattesi: 500 con messaggio generico, nessuno stack trace o dettaglio
 *   interno esposto al client. Il dettaglio completo resta solo nei log del server.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`${request.method} ${request.url}`, exception.stack);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      `Errore non gestito: ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Errore interno del server',
    });
  }
}
