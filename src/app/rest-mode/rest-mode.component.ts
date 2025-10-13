import { Component, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TorstatusPanelComponent } from '../torstatus-panel/torstatus-panel.component';
import { CalendarPanelComponent } from '../calendar-panel/calendar-panel.component';

@Component({
  selector: 'app-rest-mode',
  imports: [CalendarPanelComponent,TorstatusPanelComponent,DatePipe],
  templateUrl: './rest-mode.component.html',
  styleUrl: './rest-mode.component.scss'
})
export class RestModeComponent implements OnDestroy {
  now = signal(new Date());
  timestamp = Date.now();

  private t = setInterval(() => {
    this.now.set(new Date());
    this.timestamp = Date.now();
  }, 1000);
  private time = setInterval(() => this.now.set(new Date()), 1000);
  private reload = setInterval(() => this.reloadIframes(),5* 60 * 1000); // alle 5 Min
  url = "https://uwz.at/data/previews/AT_warning_today_all_desktop.png?cache="+this.timestamp;

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
