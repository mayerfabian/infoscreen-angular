import { Component } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common'; // 👈 hier DatePipe und NgFor hinzufügen
import { ModeService } from '../mode.service';

@Component({
  selector: 'app-incident-mode',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe], // 👈 DatePipe hier eintragen
  templateUrl: './incident-mode.component.html',
  styleUrls: ['./incident-mode.component.scss']
})
export class IncidentModeComponent {
  constructor(public modeService: ModeService) {}
}
