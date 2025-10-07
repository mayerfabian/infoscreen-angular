import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestModeComponent } from './rest-mode.component';

describe('RestModeComponent', () => {
  let component: RestModeComponent;
  let fixture: ComponentFixture<RestModeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestModeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RestModeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
