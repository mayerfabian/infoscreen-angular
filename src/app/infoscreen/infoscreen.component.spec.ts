import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InfoscreenComponent } from './infoscreen.component';

describe('InfoscreenComponent', () => {
  let component: InfoscreenComponent;
  let fixture: ComponentFixture<InfoscreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoscreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InfoscreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
