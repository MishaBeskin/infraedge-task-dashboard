import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

/** The test runner's `localStorage` is a stub without methods, so every spec
 *  that touches persistence installs a real in-memory one (as the auth specs do). */
function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

function make(): ThemeService {
  TestBed.configureTestingModule({});
  return TestBed.inject(ThemeService);
}

const matchMediaStub = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));

describe('ThemeService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggle() flips isDark and writes data-theme on <html>', () => {
    const svc = make();
    const before = svc.isDark();

    svc.toggle();

    expect(svc.isDark()).toBe(!before);
    expect(document.documentElement.getAttribute('data-theme')).toBe(
      svc.isDark() ? 'dark' : 'light',
    );
  });

  it('persists the choice to localStorage', () => {
    const svc = make();

    svc.toggle();

    expect(localStorage.getItem('stack_theme')).toBe(svc.isDark() ? 'dark' : 'light');
  });

  it('falls back to prefers-color-scheme when nothing is stored', () => {
    matchMediaStub(true);

    const svc = make();

    expect(svc.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('prefers a stored value over the OS preference', () => {
    matchMediaStub(true);
    localStorage.setItem('stack_theme', 'light');

    expect(make().isDark()).toBe(false);
  });

  it('survives a throwing localStorage during construction', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => make()).not.toThrow();
  });

  it('survives a throwing matchMedia during construction', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unavailable');
    });

    expect(() => make()).not.toThrow();
  });
});
