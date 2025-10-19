import { TestBed } from '@angular/core/testing';
import { RestV1Component } from './rest-v1.component';

describe('RestV1Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestV1Component],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(RestV1Component);
    const comp = fixture.componentInstance;
    expect(comp).toBeTruthy();
  });
});
