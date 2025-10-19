import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ModeService } from '../mode.service';

import { IncidentModeComponent } from '../incident-mode/incident-mode.component';
import { RestModeComponent } from '../rest-mode/rest-mode.component';

type Variant = 'v1' | 'v2';

@Component({
  selector: 'app-infoscreen',
  standalone: true,
  imports: [IncidentModeComponent, RestModeComponent],
  templateUrl: './infoscreen.component.html',
  styleUrls: ['./infoscreen.component.scss'],
})
export class InfoscreenComponent implements OnDestroy {
  private sub?: Subscription;

  /** Varianten aus der URL (bleiben wie gehabt) */
  incidentVariant: Variant = 'v1';
  restVariant: Variant = 'v1';

  constructor(public mode: ModeService, private route: ActivatedRoute) {
    // LIVE auf ?test=..., ?incident=..., ?rest=... reagieren
    this.sub = this.route.queryParamMap.subscribe((q) => {
      // --- TESTDATEN: ?test=1 → Mock, sonst Live
      const test = (q.get('test') || '').toLowerCase();
      this.mode.useMockData(test === '1');

      // --- OPTIONAL: expliziter Modus-Override (nur wenn ruhe/einsatz)
      if (test === 'ruhe')      this.mode.setManualOverride('ruhe');
      else if (test === 'einsatz') this.mode.setManualOverride('einsatz');
      else                        this.mode.clearManualOverride();

      // Varianten lesen
      const inc = (q.get('incident') || q.get('view') || '').toLowerCase();
      this.incidentVariant = inc === 'v2' ? 'v2' : 'v1';

      const rest = (q.get('rest') || '').toLowerCase();
      this.restVariant = rest === 'v2' ? 'v2' : 'v1';
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
