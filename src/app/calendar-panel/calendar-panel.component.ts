import { Component, OnInit, OnDestroy } from '@angular/core';
import { NgIf, NgFor, DatePipe, NgClass } from '@angular/common';
import { CalendarService, CalendarItem } from '../calendar.service';
import { interval, startWith, switchMap, Subscription } from 'rxjs';

@Component({
  selector: 'app-calendar-panel',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, NgClass],
  templateUrl: './calendar-panel.component.html',
  styleUrls: ['./calendar-panel.component.scss'],
  providers: [DatePipe] // <— HINZU

})
export class CalendarPanelComponent implements OnInit, OnDestroy {
  timezone = 'Europe/Zurich';
  events: CalendarItem[] = [];
  loading = true;

  private pollSub?: Subscription;

  constructor(private cal: CalendarService, private datePipe: DatePipe) {}

  ngOnInit(): void {
    // Poll alle 5 Sekunden (erstes Mal sofort)
    this.pollSub = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.cal.loadUpcoming(120))
    ).subscribe({
      next: (res) => {
        this.timezone = res.timezone || 'Europe/Zurich';
        this.events = res.items;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  /** HHmm im gewünschten TZ-Context (z.B. '0000' für Mitternacht) */
  private hhmm(ms?: number): string {
    if (!ms) return '';
    return this.datePipe.transform(ms, 'HHmm', this.timezone, 'de-AT') || '';
  }

  /** Zeit anzeigen?  – nein bei allDay oder Start genau 00:00 ohne Endzeit */
  showTime(ev: CalendarItem): boolean {
    if (ev.allDay) return false;
    const start = this.hhmm(ev.startMs);
    const hasEnd = !!ev.endMs;
    if (!hasEnd && start === '0000') return false; // nur 00:00 -> unterdrücken
    return true;
  }

  /** Von–bis anzeigen? – ja, wenn Endzeit vorhanden */
  hasEndTime(ev: CalendarItem): boolean {
    return !!ev.endMs;
  }

  /** CSS-Klasse für Kategorie (wie gehabt) */
  catClass(cat?: string) {
    const c = (cat || '').toLowerCase().trim();
    if (!c) return 'cat-termin';
    if (c.includes('übung')|| c.includes('uebung')) return 'cat-uebung';
    if (c.includes('besprech')) return 'cat-besprechung';
    if (c.includes('modulausbildung')) return 'cat-modulausbildung';
    if (c.includes('bewerb')) return 'cat-bewerb';
    if (c.includes('ausbildung') || c.includes('schulung')) return 'cat-ausbildung';
    if (c.includes('jugend')) return 'cat-jugend';
    if (c.includes('kind')) return 'cat-kind';
    if (c.includes('einsatz') || c.includes('alarm')) return 'cat-einsatz';
    if (c.includes('veranstalt') || c.includes('event') || c.includes('fest')) return 'cat-veranstaltung';
    if (c.includes('termin') || c.includes('sonstig') || c.includes('divers')) return 'cat-termin';
    return 'cat-default';
}


  /** Anzeigename (Fallback „Termin“) */
  catLabel(cat?: string) {
    return (cat && cat.trim()) ? cat : 'Termin';
  }
}
