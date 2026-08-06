import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, TitleStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PageTitleStrategy } from './page-title.strategy';

@Component({ template: '' })
class EmptyStubComponent {}

describe('PageTitleStrategy', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TitleStrategy, useClass: PageTitleStrategy },
        provideRouter([
          { path: 'con-titolo', title: 'Prodotti', component: EmptyStubComponent },
          { path: 'senza-titolo', component: EmptyStubComponent },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('antepone il prefisso VestiFlow al titolo di rotta', async () => {
    await harness.navigateByUrl('/con-titolo');

    expect(TestBed.inject(Title).getTitle()).toBe('VestiFlow · Prodotti');
  });

  it('senza title di rotta ricade sul solo nome app', async () => {
    await harness.navigateByUrl('/senza-titolo');

    expect(TestBed.inject(Title).getTitle()).toBe('VestiFlow');
  });
});
