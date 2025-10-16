import { Component, Input } from '@angular/core';
import { CommonModule, NgIf, NgFor, DatePipe } from '@angular/common';
import { Einsatz } from '../../mode.service';
import { environment } from '../../../environments/environments'; // ggf. Pfad anpassen

@Component({
  selector: 'app-alarm-v2',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor, DatePipe],
  templateUrl: './alarm-v2.component.html',
  styleUrls: ['./alarm-v2.component.scss']
})
export class AlarmV2Component {
  @Input() einsatz: Einsatz | null = null;

  // Street View Static API
  readonly size = '640x640'; // quadratisch für volle Höhe (Free-Tier Limit 640)
  readonly fov = 90;         // 4 * 90° ≈ 360°
  readonly pitch = 0;
  readonly headings = [0, 90, 180, 270]; // gern auf [0,60,120,180,240,300] erweitern

  // Scroll-Settings
  scrollDurationSec = 10;    // hin ODER zurück (eine Richtung) – passe nach Geschmack an

  meldebild(e?: Einsatz): string {
    if (!e) return 'ALARM';
    const typ = (e.eventtype || '').trim();
    const text = (e.eventtypetext || '').trim();
    return (typ && text) ? `${typ} – ${text}` : (typ || text || 'ALARM');
  }

  buildUrls(): string[] {
    const e = this.einsatz;
    const key = (environment as any)?.GOOGLE_STREETVIEW_KEY || '';
    const lat = e?.location?.x ?? null; // bei euch: x = Lat
    const lon = e?.location?.y ?? null; // y = Lon
    if (!key || lat == null || lon == null) return [];

    const base = 'https://maps.googleapis.com/maps/api/streetview';
    return this.headings.map(h => {
      const params = new URLSearchParams({
        size: this.size,
        location: `${lat},${lon}`,
        heading: String(h),
        pitch: String(this.pitch),
        fov: String(this.fov),
        source: 'outdoor',
        key
      });
      return `${base}?${params.toString()}`;
    });
  }

  get missingKey(): boolean {
    return !(environment as any)?.GOOGLE_STREETVIEW_KEY;
  }
  get missingCoords(): boolean {
    return !(this.einsatz?.location?.x != null && this.einsatz?.location?.y != null);
  }
}
