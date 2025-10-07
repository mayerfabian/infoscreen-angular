import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TorstatusPanelComponent } from './torstatus-panel.component';

describe('TorstatusPanelComponent', () => {
  let component: TorstatusPanelComponent;
  let fixture: ComponentFixture<TorstatusPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TorstatusPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TorstatusPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
