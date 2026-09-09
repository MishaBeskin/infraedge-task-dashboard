import { TestBed } from '@angular/core/testing';
import { TeamSwitcherComponent } from './team-switcher.component';
import { Team } from '../../models/team.model';

const teams: Team[] = [
  { id: 't1', name: 'Alpha', role: 'owner' },
  { id: 't2', name: 'Beta', role: 'member' },
];

function mount() {
  const fixture = TestBed.createComponent(TeamSwitcherComponent);
  fixture.componentRef.setInput('teams', teams);
  fixture.componentRef.setInput('activeTeamId', 't1');
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

describe('TeamSwitcherComponent', () => {
  afterEach(() => {
    document.querySelectorAll('app-team-switcher').forEach((el) => el.remove());
  });

  it('toggles the panel open and closed from the trigger', () => {
    const fixture = mount();
    const trigger: HTMLButtonElement =
      fixture.nativeElement.querySelector('.team-switcher__trigger');

    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeNull();
  });

  it('renders one radio row per team with the active one checked and its role', () => {
    const fixture = mount();
    fixture.nativeElement.querySelector('.team-switcher__trigger').click();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[role="menuitemradio"]');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('aria-checked')).toBe('true');
    expect(rows[1].getAttribute('aria-checked')).toBe('false');
    // Default UI language is Hebrew.
    expect(rows[0].textContent).toContain('בעלים');
    expect(rows[1].textContent).toContain('חבר');
  });

  it('emits switchTeam only for a different team and then closes', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const emitted: string[] = [];
    comp.switchTeam.subscribe((id) => emitted.push(id));
    const openPanel = () => {
      fixture.nativeElement.querySelector('.team-switcher__trigger').click();
      fixture.detectChanges();
    };

    openPanel();
    fixture.nativeElement.querySelectorAll('[role="menuitemradio"]')[0].click(); // active -> no emit
    fixture.detectChanges();

    openPanel();
    fixture.nativeElement.querySelectorAll('[role="menuitemradio"]')[1].click(); // different -> emit
    fixture.detectChanges();

    expect(emitted).toEqual(['t2']);
    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeNull();
  });

  it('Escape closes the panel', () => {
    const fixture = mount();
    fixture.nativeElement.querySelector('.team-switcher__trigger').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeNull();
  });

  it('emits openCreate and closes when the "New team" row is chosen', () => {
    const fixture = mount();
    let opened = 0;
    fixture.componentInstance.openCreate.subscribe(() => opened++);

    fixture.nativeElement.querySelector('.team-switcher__trigger').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.team-switcher__row--new').click();
    fixture.detectChanges();

    expect(opened).toBe(1);
    expect(fixture.nativeElement.querySelector('.team-switcher__panel')).toBeNull();
  });
});
