import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlarmV1Component } from './alarm-v1.component';

describe('AlarmV1Component', () => {
  let component: AlarmV1Component;
  let fixture: ComponentFixture<AlarmV1Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlarmV1Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlarmV1Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
