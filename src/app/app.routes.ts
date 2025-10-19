// src/app/app.routes.ts  (vollständig)
import { Routes } from '@angular/router';

export const routes: Routes = [
  // AUTO: Schaltet zwischen Rest/Incident je nach Daten/Override
  {
    path: '',
    loadComponent: () =>
      import('./infoscreen/infoscreen.component').then(m => m.InfoscreenComponent),
  },
  { path: 'auto', redirectTo: '', pathMatch: 'full' },

  // INCIDENT fest: V1
  {
    path: 'alarm',
    loadComponent: () =>
      import('./incident-mode/incident-mode.component').then(m => m.IncidentModeComponent),
  },

  // INCIDENT fest: V2
  {
    path: 'alarm2',
    loadComponent: () =>
      import('./incident-mode/incident-mode.component').then(m => m.IncidentModeComponent),
    data: { variant: 'v2' },
  },

  // REST fest: V1
  {
    path: 'rest',
    loadComponent: () =>
      import('./rest-mode/rest-mode.component').then(m => m.RestModeComponent),
  },

  // REST fest: V2 (für später; Komponente muss’s unterstützen)
  {
    path: 'rest2',
    loadComponent: () =>
      import('./rest-mode/rest-mode.component').then(m => m.RestModeComponent),
    data: { variant: 'v2' },
  },
];
