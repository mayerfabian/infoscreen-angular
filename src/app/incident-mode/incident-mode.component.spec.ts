import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IncidentModeComponent } from './incident-mode.component';

describe('IncidentModeComponent', () => {
  let component: IncidentModeComponent;
  let fixture: ComponentFixture<IncidentModeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentModeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IncidentModeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
