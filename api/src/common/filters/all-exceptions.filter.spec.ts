import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  function createHost() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const request = { method: 'GET', url: '/api/test' };
    const response = { status, json };

    return {
      host: {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => request,
        }),
      },
      status,
      json,
    };
  }

  it('propaga HttpException noto al client', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException('Dati non validi'), host as never);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalled();
  });

  it('maschera errori non gestiti come 500 generico', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error('database exploded'), host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Errore interno del server',
    });
  });

  it('logga stack trace su errori 5xx HttpException', () => {
    const filter = new AllExceptionsFilter();
    const { host } = createHost();
    const error = new InternalServerErrorException('fail');

    expect(() => filter.catch(error, host as never)).not.toThrow();
  });

  it('maschera un errore Prisma non gestito (es. vincolo unique) come 500 generico', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost();

    // Simula un errore Prisma non intercettato da nessun service (es. vincolo
    // unique violato a livello DB): non deve mai raggiungere il client come
    // testo grezzo Postgres/Prisma.
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`tenantId`,`sku`)',
      { code: 'P2002', clientVersion: '6.19.3', meta: { target: ['tenantId', 'sku'] } },
    );

    filter.catch(prismaError, host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Errore interno del server',
    });
    const payload = json.mock.calls[0]?.[0] as { message: string };
    expect(payload.message).not.toContain('Unique constraint');
    expect(payload.message).not.toContain('Prisma');
    expect(payload.message).not.toContain('P2002');
  });
});
