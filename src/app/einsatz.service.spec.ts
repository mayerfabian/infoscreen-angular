import { TestBed } from '@angular/core/testing';

import { EinsatzService } from './einsatz.service';

describe('EinsatzService', () => {
  let service: EinsatzService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EinsatzService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
