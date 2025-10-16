import { Component, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IncidentModeComponent } from '../incident-mode/incident-mode.component';
import { RestModeComponent } from '../rest-mode/rest-mode.component';
import { ModeService } from '../mode.service';

@Component({
  selector: 'app-infoscreen',
  standalone: true,
  imports: [IncidentModeComponent,RestModeComponent],
  templateUrl: './infoscreen.component.html',
  styleUrls: ['./infoscreen.component.scss']
})
export class InfoscreenComponent implements OnDestroy {
  now = signal(new Date());
  timestamp = Date.now();

  private t = setInterval(() => {
    this.now.set(new Date());
    this.timestamp = Date.now();
  }, 1000);
  private time = setInterval(() => this.now.set(new Date()), 1000);
  private reload = setInterval(() => this.reloadIframes(),5* 60 * 1000); // alle 5 Min
  url = "https://uwz.at/data/previews/AT_warning_today_all_desktop.png?cache="+this.timestamp;
  // src/app/infoscreen/infoscreen.component.ts
  constructor(public mode: ModeService) {}


  reloadIframes() {
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach((frame: HTMLIFrameElement) => {
      // sanftes Ausblenden
      frame.style.transition = 'opacity 0.5s ease';
      frame.style.opacity = '0.1';

      setTimeout(() => {
        const src = frame.src;
        frame.src = src;
      }, 500); // nach dem Fade-Out neu laden

      // nach 3 Sekunden wieder einblenden (genug Zeit für Laden)
      setTimeout(() => {
        frame.style.opacity = '1';
      }, 3000);
    });

    console.log('Iframes reloaded with fade effect');
  }


  ngOnDestroy() {
    clearInterval(this.t);
    clearInterval(this.time);
    clearInterval(this.reload);
  }
}
