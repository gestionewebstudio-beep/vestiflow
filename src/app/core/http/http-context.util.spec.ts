import { HttpContext, HttpParams } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { SILENT_HTTP_ERROR, withSilentHttpError } from './http-context.util';

describe('withSilentHttpError', () => {
  it('imposta SILENT_HTTP_ERROR nel context', () => {
    const options = withSilentHttpError();
    expect(options.context.get(SILENT_HTTP_ERROR)).toBe(true);
  });

  it('preserva altre opzioni e un context esistente', () => {
    const existing = new HttpContext().set(SILENT_HTTP_ERROR, false);
    const params = new HttpParams().set('page', '1');

    const options = withSilentHttpError({ params, context: existing });

    expect(options.params?.get('page')).toBe('1');
    expect(options.context.get(SILENT_HTTP_ERROR)).toBe(true);
  });
});
