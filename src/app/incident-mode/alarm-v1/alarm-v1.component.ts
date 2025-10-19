import {
  Component, AfterViewInit, OnDestroy, NgZone, Input,
  OnChanges, SimpleChanges, OnInit
} from '@angular/core';
import { CommonModule, NgIf, NgFor } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Einsatz, LeaPerson } from '../../models/lea.interfaces';
import * as L from 'leaflet';

type Resp = 'yes' | 'no' | 'open';

interface PersonView {
  name: string;
  resp: Resp;                               // yes | no (open wird ignoriert)
  roles: ('EL'|'ELMIT'|'ATS'|'C')[];        // für optionale Badges in der Liste
  freeText?: string | null;                 // Freitext aus response.freetext (nur sinnvoll bei "no")
}

interface RoleBox {
  key: 'EL' | 'ELMIT' | 'ATS' | 'C';
  label: string;       // EL | Einsatzleitung | ATS | C-Fahrer
  yesNames: string[];  // zur Anzeige (ggf. leer, siehe showNames)
  yesCount: number;    // voller Zusage-Count
  showNames: boolean;  // globales Flag: nur wenn KEINE Kategorie > 6
}

@Component({
  selector: 'app-alarm-v1',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor],
  templateUrl: './alarm-v1.component.html',
  styleUrls: ['./alarm-v1.component.scss']
})
export class AlarmV1Component implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() einsatz: Einsatz | null = null;
  /** Optional: aktuelle Zeit (für Elapsed/Timer-Anzeigen) */
  @Input() now: Date = new Date();
  // --- Karte (rechter Bereich) ---
  private map?: L.Map;
  private marker?: L.Marker;
  private mapInited = false;
  private mapInterval?: any;

  // --- Uhr für „Seit Alarm“ (oben links im Info-Panel) ---
  // now = new Date();
  private clockHandle?: any;

  // --- Rückmeldungen & Rollen (linkes unteres Panel) ---
  peopleYes: PersonView[] = [];
  peopleNo: PersonView[] = [];

  roleBoxes: RoleBox[] = [
    { key: 'EL',    label: 'EL',             yesNames: [], yesCount: 0, showNames: true },
    { key: 'ELMIT', label: 'Einsatzleitung', yesNames: [], yesCount: 0, showNames: true }, // „EL - Mit“
    { key: 'ATS',   label: 'ATS',            yesNames: [], yesCount: 0, showNames: true },
    { key: 'C',     label: 'C-Fahrer',       yesNames: [], yesCount: 0, showNames: true }
  ];

  /** Wenn irgendeine Rolle >6 Zusagen hat → Namen unten ausblenden & Badges in der Liste zeigen */
  showBadgesPerUser = false;

  /** Typo-Dichte: ab 30 Rückmeldungen kleiner */
  dense = false;

  /** Optionaler URL-Parameter `?user=25` → begrenzt die ANZAHL der geladenen Personen */
  private userLimit: number | null = null;

  /** Gefilterte, alarmierte Wachen (Badges im Info-Panel) */
  stations: string[] = [];

  constructor(private zone: NgZone, private route: ActivatedRoute) {}

  // ---------------- Lifecycle ----------------
  ngOnInit(): void {
    this.readUserLimitFromRoute();
    this.route.queryParamMap.subscribe(() => {
      const before = this.userLimit;
      this.readUserLimitFromRoute();
      if (before !== this.userLimit) this.recomputePeopleAndRoles();
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.mapInterval = setInterval(() => this.ensureMap(), 300);
    });
    this.clockHandle = setInterval(() => { this.now = new Date(); }, 1000);
  }

  ngOnDestroy(): void {
    if (this.mapInterval) clearInterval(this.mapInterval);
    if (this.clockHandle) clearInterval(this.clockHandle);
    this.map?.remove();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('einsatz' in changes) {
      this.recomputePeopleAndRoles();
    }
  }

  // ---------------- URL Param ----------------
  private readUserLimitFromRoute(): void {
    const raw = this.route.snapshot.queryParamMap.get('user');
    const n = raw != null ? Number(raw) : NaN;
    this.userLimit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  // ---------------- Helpers ----------------
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

  private normResp(v: any): Resp {
    if (v == null) return 'open';
    const s = String(v).trim().toLowerCase();
    if (['ja', 'yes', 'y', 'true', '1'].includes(s)) return 'yes';
    if (['nein', 'no', 'n', 'false', '0'].includes(s)) return 'no';
    return 'open';
  }

  private roleKeysForPerson(p: LeaPerson): ('EL'|'ELMIT'|'ATS'|'C')[] {
    const fs = p.functions ?? [];
    const keys: ('EL'|'ELMIT'|'ATS'|'C')[] = [];
    for (const f of fs) {
      const name = (f.shortname || f.name || '').trim();
      if (name === 'EL') keys.push('EL');
      if (name === 'EL - Mit') keys.push('ELMIT');
      if (name === 'ATS') keys.push('ATS');
      if (name === 'C') keys.push('C');
    }
    return Array.from(new Set(keys));
  }

  /** Filtert alarmierte Wachen (FF), keine Info-Schienen */
  private computeStations(): string[] {
    const divs = this.einsatz?.additionaldivisions ?? [];
    const out: string[] = [];
    for (const d of divs as any[]) {
      const units = d?.organizationalunits ?? [];
      for (const ou of units) {
        const type = (ou?.type ?? '').toString().toUpperCase();
        const label = (ou?.description || ou?.name || '').toString().trim();
        if (!label) continue;
        if (type === 'FF' && !/info/i.test(label)) out.push(label);
      }
    }
    return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b, 'de'));
  }

  private recomputePeopleAndRoles(): void {
    const MAX_SHOW_NAMES = 6;  // Wenn eine Kategorie > 6 → überall Namen aus
    const MAX_LISTED = 5;      // Falls Namen gezeigt werden: max. so viele

    this.stations = this.computeStations();

    this.peopleYes = [];
    this.peopleNo  = [];
    this.roleBoxes = [
      { key: 'EL',    label: 'EL',             yesNames: [], yesCount: 0, showNames: true },
      { key: 'ELMIT', label: 'Einsatzleitung', yesNames: [], yesCount: 0, showNames: true },
      { key: 'ATS',   label: 'ATS',            yesNames: [], yesCount: 0, showNames: true },
      { key: 'C',     label: 'C-Fahrer',       yesNames: [], yesCount: 0, showNames: true }
    ];

    // Quelle ggf. begrenzen
    const srcAll = this.einsatz?.alarmedpersons ?? [];
    const src = this.userLimit != null ? srcAll.slice(0, this.userLimit) : srcAll;

    for (const p of src) {
      const name = `${(p as any).firstname ?? ''} ${(p as any).lastname ?? ''}`.trim();
      const resp = this.normResp((p as any).response?.basicresponse);
      if (resp === 'open') continue;
      const roles = this.roleKeysForPerson(p as LeaPerson);
      const freeText = (p as any).response?.freetext?.toString()?.trim() || null;

      const view: PersonView = { name, resp, roles, freeText };
      if (resp === 'yes') this.peopleYes.push(view);
      else this.peopleNo.push(view);

      if (resp === 'yes') {
        for (const rk of roles) {
          const box = this.roleBoxes.find(b => b.key === rk)!;
          box.yesNames.push(name);
        }
      }
    }

    // sortieren
    this.peopleYes.sort((a,b)=>a.name.localeCompare(b.name,'de'));
    this.peopleNo.sort((a,b)=>a.name.localeCompare(b.name,'de'));

    // Counts & globale Darstellungslogik
    for (const box of this.roleBoxes) box.yesCount = box.yesNames.length;
    const anyTooMany = this.roleBoxes.some(b => b.yesCount > MAX_SHOW_NAMES);

    // → globales Flag für Badges in der Liste
    this.showBadgesPerUser = anyTooMany;

    for (const box of this.roleBoxes) {
      if (anyTooMany) {
        box.showNames = false;
        box.yesNames = [];
      } else {
        box.showNames = true;
        if (box.yesNames.length > MAX_LISTED) box.yesNames = box.yesNames.slice(0, MAX_LISTED);
      }
    }

    const totalShown = this.peopleYes.length + this.peopleNo.length;
    this.dense = totalShown >= 30;
  }

  // ---------------- Map (rechter Bereich) ----------------
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

    const lat = e.location?.x ?? null;
    const lon = e.location?.y ?? null;
    if (lat == null || lon == null) return;

    const center: [number, number] = [lat, lon];
    const icon = this.buildLeaDivIcon();
    const initialZoom = 16;

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
}
