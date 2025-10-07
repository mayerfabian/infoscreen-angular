import { Component } from '@angular/core';
import { NgIf, NgFor, DatePipe, NgClass } from '@angular/common';
import { EinsatzService, EinsatzKurz } from '../einsatz.service';

const WEEK_MS =200 * 7 * 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-torstatus-panel',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, NgClass],
  templateUrl: './torstatus-panel.component.html',
  styleUrls: ['./torstatus-panel.component.scss']
})
export class TorstatusPanelComponent {
  einsaetze: EinsatzKurz[] = [];
  loading = true;
  now = Date.now();

  constructor(private es: EinsatzService) {
    this.load();
    // alle 2 Minuten API neu laden
    setInterval(() => this.load(), 120000);
    // jede Minute die Zeitangaben aktualisieren
    setInterval(() => (this.now = Date.now()), 60000);
  }

  private load() {
    this.loading = true;
    this.es.getAktiveEinsaetzeBezirk('bezirk_15').subscribe(list => {
      const cutoff = Date.now() - WEEK_MS;
      this.einsaetze = (list || [])
        .filter(e => typeof e.ts === 'number' && e.ts >= cutoff)
        .sort((a, b) => b.ts - a.ts);
      this.loading = false;
    });
  }

  /** Gibt Text wie "vor 3 Stunden" oder "seit 2 Tagen" zurück */
  diffText(ts: number): string {
    const diffMs = this.now - ts;
    if (diffMs < 0) return '';
    const min = Math.floor(diffMs / 60000);
    if (min < 60) return `seit ${min} Min${min === 1 ? 'ute' : 'uten'}`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `seit ${hrs} Std${hrs === 1 ? '' : 'n'}`;
    const days = Math.floor(hrs / 24);
    return `seit ${days} Tag${days === 1 ? '' : 'en'}`;
  }
}
