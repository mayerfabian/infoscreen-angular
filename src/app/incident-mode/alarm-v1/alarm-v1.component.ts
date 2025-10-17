import { Component, AfterViewInit, OnDestroy, NgZone, Input } from '@angular/core';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { Einsatz } from '../../mode.service';
import * as L from 'leaflet';

@Component({
  selector: 'app-alarm-v1',
  standalone: true,
  imports: [CommonModule, NgIf],
  templateUrl: './alarm-v1.component.html',
  styleUrls: ['./alarm-v1.component.scss']
})
export class AlarmV1Component implements AfterViewInit, OnDestroy {
  @Input() einsatz: Einsatz | null = null;

  private map?: L.Map;
  private marker?: L.Marker;
  private mapInited = false;
  private mapInterval?: any;

  /** interner Takt für „Seit Alarm“ */
  now = new Date();
  private clockHandle?: any;

  constructor(private zone: NgZone) {}

  /** HH:mm:ss bei >1h, sonst mm:ss */
  elapsedShort(e?: Einsatz | null): string {
    if (!e?.alarmtime) return '—';
    const diff = Math.max(0, this.now.getTime() - e.alarmtime);
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /** SVG-Pin (kein PNG nötig) */
  private buildLeaDivIcon(): L.DivIcon {
    const svgPin = `
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <defs><filter id="leaGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ff0033" flood-opacity="0.6"/></filter></defs>
        <path d="M16 1c-6.1 0-11 4.9-11 11 0 8.3 8.3 15.2 10.3 16.8.4.3 1 .3 1.4 0C18.7 27.2 27 20.3 27 12 27 5.9 22.1 1 16 1z"
              fill="#ffd400" stroke="#ff0033" stroke-width="2" filter="url(#leaGlow)"/>
        <circle cx="16" cy="12" r="4" fill="#ff0033"/>
      </svg>`;
    return L.divIcon({ className:'lea-pin', html:svgPin, iconSize:[32,32], iconAnchor:[16,32] });
  }

  private ensureMap(): void {
    const e = this.einsatz;
    const el = document.getElementById('incidentMapV1') as HTMLElement | null;
    if (!e || !el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const lat = e.location?.x ?? null; // x = Lat
    const lon = e.location?.y ?? null; // y = Lon
    if (lat == null || lon == null) return;

    const center: [number, number] = [lat, lon];
    const icon = this.buildLeaDivIcon();
    const initialZoom = 15;

    if (!this.mapInited) {
      this.map = L.map(el, { zoomControl:false, attributionControl:true });
      this.map.setView(center, initialZoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:20, attribution:'© OpenStreetMap'
      }).addTo(this.map);
      this.marker = L.marker(center, { icon, zIndexOffset:1000 }).addTo(this.map);
      setTimeout(()=>this.map!.invalidateSize(),0);
      this.mapInited = true;
    } else {
      const currentZoom = this.map!.getZoom() ?? initialZoom;
      const targetZoom = Math.max(currentZoom, initialZoom);
      this.map!.setView(center, targetZoom);
      this.marker?.setIcon(icon);
      this.marker?.setLatLng(center);
      this.map!.invalidateSize();
    }
  }

  ngAfterViewInit(): void {
    // Karte sanft pollen (Größenänderungen, Datenwechsel)
    this.zone.runOutsideAngular(()=>{ this.mapInterval = setInterval(()=> this.ensureMap(), 300); });

    // „Seit Alarm“ jede Sekunde aktualisieren
    this.clockHandle = setInterval(() => { this.now = new Date(); }, 1000);
  }

  ngOnDestroy(): void {
    if (this.mapInterval) clearInterval(this.mapInterval);
    if (this.clockHandle) clearInterval(this.clockHandle);
    this.map?.remove();
  }
}
