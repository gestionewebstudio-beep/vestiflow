import { describe, expect, it } from 'vitest';

import { formatCausalDate, renderCausalTemplate } from './causal-template.util';

describe('renderCausalTemplate', () => {
  it('caso 1: DDT completo con numero e data', () => {
    expect(
      renderCausalTemplate('DDT {numero} del {data}', { number: '145', dateIso: '2026-05-08' }),
    ).toBe('DDT 145 del 08/05/2026');
  });

  it('caso 2: DDT senza data omette "del"', () => {
    expect(renderCausalTemplate('DDT {numero} del {data}', { number: '145' })).toBe('DDT 145');
  });

  it('senza numero mantiene "del data"', () => {
    expect(renderCausalTemplate('DDT {numero} del {data}', { dateIso: '2026-05-08' })).toBe(
      'DDT del 08/05/2026',
    );
  });

  it('numero e data vuoti lasciano solo il prefisso', () => {
    expect(renderCausalTemplate('Fatt. {numero} del {data}', {})).toBe('Fatt.');
  });

  it('modello con suffisso operativo senza data', () => {
    expect(renderCausalTemplate('DDT {numero} del {data} - C/Lavorazione', { number: '145' })).toBe(
      'DDT 145 - C/Lavorazione',
    );
  });

  it('modello con suffisso operativo completo', () => {
    expect(
      renderCausalTemplate('DDT {numero} del {data} - C/Lavorazione', {
        number: '145',
        dateIso: '2026-05-08',
      }),
    ).toBe('DDT 145 del 08/05/2026 - C/Lavorazione');
  });

  it('modello senza segnaposto resta invariato', () => {
    expect(renderCausalTemplate('Reso da Cliente Conto Visione', { number: '9' })).toBe(
      'Reso da Cliente Conto Visione',
    );
  });

  it('non produce mai segnaposto letterali o "del" orfani', () => {
    const result = renderCausalTemplate('Bolla doganale {numero} del {data}', {});
    expect(result).toBe('Bolla doganale');
    expect(result).not.toMatch(/\{|\}|del\s*$/);
  });
});

describe('formatCausalDate', () => {
  it('formatta ISO in GG/MM/AAAA', () => {
    expect(formatCausalDate('2026-07-11')).toBe('11/07/2026');
  });

  it('accetta ISO con orario troncando al giorno', () => {
    expect(formatCausalDate('2026-07-11T00:00:00.000Z')).toBe('11/07/2026');
  });

  it('stringa vuota per input non valido', () => {
    expect(formatCausalDate('non-data')).toBe('');
  });
});
