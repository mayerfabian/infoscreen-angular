import { Component } from '@angular/core';
import { NgIf, NgFor, DatePipe, NgClass } from '@angular/common';
import { ModeService, LeaPerson, Einsatz } from '../mode.service';

@Component({
  selector: 'app-incident-mode',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, NgClass],
  templateUrl: './incident-mode.component.html',
  styleUrls: ['./incident-mode.component.scss']
})
export class IncidentModeComponent {
  constructor(public modeService: ModeService) {}

  /** Hilfstext relativ (z.B. 'vor 3 Min') */
  since(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'soeben';
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `vor ${m} Min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `vor ${h} Std`;
    const d = Math.floor(h / 24);
    return `vor ${d} Tg`;
  }

  countResponses(e: Einsatz) {
    const ppl = e.alarmedpersons || [];
    let yes = 0, no = 0, open = 0;
    for (const p of ppl) {
      const r = p.response?.basicresponse;
      if (r === 'Ja') yes++;
      else if (r === 'Nein') no++;
      else open++;
    }
    return { yes, no, open, total: ppl.length };
  }

  hasRole(p: LeaPerson, short: string) {
    return (p.functions || []).some(f => f.shortname === short);
  }

  /** Liste von Namen mit bestimmter Funktion und 'Ja' Rückmeldung */
  namesByRoleYes(e: Einsatz, short: string): string[] {
    const ppl = e.alarmedpersons || [];
    return ppl.filter(p => this.hasRole(p, short) && p.response?.basicresponse === 'Ja')
              .map(p => `${p.firstname} ${p.lastname}`);
  }

  meldebild(e?: Einsatz): string {
    if (!e) return 'ALARM';
    const typ = (e.eventtype || '').trim();
    const text = (e.eventtypetext || '').trim();
    if (typ && text) return `${typ} – ${text}`;
    return typ || text || 'ALARM';
  }
}
