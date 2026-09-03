import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';

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

function make(): I18nService {
  TestBed.configureTestingModule({});
  return TestBed.inject(I18nService);
}

describe('I18nService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('t() returns the mapped string for the active language', () => {
    const svc = make();
    expect(svc.t('status.todo')).toBe('לעשות');
  });

  it('t() falls back to the key itself when it is missing', () => {
    const svc = make();
    expect(svc.t('no.such.key')).toBe('no.such.key');
  });

  it('setLang switches the language and updates <html> lang/dir', () => {
    const svc = make();

    svc.setLang('en');

    expect(svc.lang()).toBe('en');
    expect(svc.t('status.todo')).toBe('To do');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('toggle() flips between he and en', () => {
    const svc = make();
    svc.setLang('he');

    svc.toggle();
    expect(svc.lang()).toBe('en');

    svc.toggle();
    expect(svc.lang()).toBe('he');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('persists the choice to localStorage', () => {
    const svc = make();

    svc.setLang('en');

    expect(localStorage.getItem('stack_lang')).toBe('en');
  });

  it('survives a throwing localStorage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    const svc = make(); // construction reads storage — must not throw
    expect(() => svc.setLang('en')).not.toThrow();
    expect(svc.lang()).toBe('en');
  });
});
