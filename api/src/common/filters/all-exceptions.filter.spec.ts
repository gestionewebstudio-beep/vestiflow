import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
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
});
