import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TorstatusPanelComponent } from '../../torstatus-panel/torstatus-panel.component';
import { CalendarPanelComponent } from '../../calendar-panel/calendar-panel.component';

@Component({
  selector: 'app-rest-v1',
  standalone: true,
  imports: [CommonModule, TorstatusPanelComponent, CalendarPanelComponent],
  templateUrl: './rest-v1.component.html',
  styleUrl: './rest-v1.component.scss'
})
export class RestV1Component implements OnInit {
  /** vom Parent gereichte UWZ-URL (mit Cache-Buster) */
  @Input() uwzUrl!: string;

  /** optional: Funktion vom Parent, um iFrames sanft neu zu laden */
  @Input() reloadIframes?: () => void;

  ngOnInit(): void {
    // nichts weiter – reine Darstellung
  }
}
