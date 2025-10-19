import { TestBed } from '@angular/core/testing';
import { RestV2Component } from './rest-v2.component';

describe('RestV2Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestV2Component],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(RestV2Component);
    const comp = fixture.componentInstance;
    expect(comp).toBeTruthy();
  });
});
