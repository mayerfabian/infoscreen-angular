import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'alarm',
    loadComponent: () =>
      import('./incident-mode/incident-mode.component').then(m => m.IncidentModeComponent),
    data: { variant: 'v1' }
  },
  {
    path: 'alarm2',
    loadComponent: () =>
      import('./incident-mode/incident-mode.component').then(m => m.IncidentModeComponent),
    data: { variant: 'v2' }
  },
  { path: '', pathMatch: 'full', redirectTo: 'alarm' }
];
