import { Component } from '@angular/core';
import { NgIf, NgFor, DatePipe, NgClass } from '@angular/common';
import { CalendarService, CalendarItem } from '../calendar.service';

@Component({
  selector: 'app-calendar-panel',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, NgClass],
  templateUrl: './calendar-panel.component.html',
  styleUrls: ['./calendar-panel.component.scss']
})
export class CalendarPanelComponent {
  timezone = 'Europe/Zurich';
  events: CalendarItem[] = [];
  loading = true;

  constructor(private cal: CalendarService) {
    this.load();
    // alle 10 Minuten aktualisieren
    setInterval(() => this.load(), 10 * 60 * 1000);
  }

  private load() {
    this.loading = true;
    this.cal.loadUpcoming(120).subscribe(res => {
      this.timezone = res.timezone || 'Europe/Zurich';
      this.events = res.items;
      this.loading = false;
    });
  }

  /** Liefert CSS-Klasse für die Kategoriespalte */
  catClass(cat?: string) {
    const c = (cat || '').toLowerCase();
    if (c.includes('übung') || c.includes('uebung')) return 'cat-uebung';
    if (c.includes('besprech')) return 'cat-besprechung';
    if (c.includes('bewerb')) return 'cat-bewerb';
    if (c.includes('ausbildung')) return 'cat-ausbildung';
    if (c.includes('termin')) return 'cat-termin';
    return 'cat-default';
  }

  catLabel(cat?: string) {
    return (cat && cat.trim()) ? cat : 'Termin';
  }
}
