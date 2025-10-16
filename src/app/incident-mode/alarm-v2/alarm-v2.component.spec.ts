import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlarmV2Component } from './alarm-v2.component';

describe('AlarmV2Component', () => {
  let component: AlarmV2Component;
  let fixture: ComponentFixture<AlarmV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlarmV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlarmV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
