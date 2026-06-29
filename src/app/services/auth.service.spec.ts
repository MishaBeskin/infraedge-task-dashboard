import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { User } from '../models/task.model';

const mockUser: User = {
  id: 1,
  name: 'Alice Johnson',
  email: 'alice@example.com',
  password: 'alice123',
  token: 'tok-alice-a1b2c3',
};

// localStorage is not fully implemented in happy-dom; use a plain-object mock
let store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { store = {}; },
};

vi.stubGlobal('localStorage', localStorageMock);

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    store = {};
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    store = {};
  });

  // ── Construction ──────────────────────────────────────────────

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should restore session from localStorage on init', () => {
    store['stack_user'] = JSON.stringify(mockUser);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    expect(fresh.getCurrentUser()).toEqual(mockUser);
    expect(fresh.isLoggedIn()).toBe(true);
  });

  it('should start with no user when localStorage is empty', () => {
    expect(service.getCurrentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  // ── login() ───────────────────────────────────────────────────

  it('should set currentUser and save to localStorage on successful login', () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    expect(service.getCurrentUser()).toEqual(mockUser);
    expect(service.isLoggedIn()).toBe(true);
    expect(JSON.parse(store['stack_user'])).toEqual(mockUser);
  });

  it('should not set currentUser when credentials return no match', () => {
    service.login('wrong@example.com', 'wrong').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([]);

    expect(service.getCurrentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
    expect(store['stack_user']).toBeUndefined();
  });

  it('should call the correct URL with email and password', () => {
    service.login('alice@example.com', 'alice123').subscribe();
    const req = http.expectOne(
      'http://localhost:3000/users?email=alice@example.com&password=alice123'
    );
    expect(req.request.method).toBe('GET');
    req.flush([mockUser]);
  });

  it('should emit the logged-in user on currentUser$', async () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    const user = await firstValueFrom(service.currentUser$);
    expect(user).toEqual(mockUser);
  });

  // ── logout() ──────────────────────────────────────────────────

  it('should clear currentUser and localStorage on logout', () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    service.logout();

    expect(service.getCurrentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
    expect(store['stack_user']).toBeUndefined();
  });

  it('should emit null on currentUser$ after logout', async () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    service.logout();
    const user = await firstValueFrom(service.currentUser$);
    expect(user).toBeNull();
  });

  // ── getToken() ────────────────────────────────────────────────

  it('should return null when not logged in', () => {
    expect(service.getToken()).toBeNull();
  });

  it('should return the user token when logged in', () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    expect(service.getToken()).toBe('tok-alice-a1b2c3');
  });

  it('should return null after logout', () => {
    service.login('alice@example.com', 'alice123').subscribe();
    http.expectOne(r => r.url.includes('/users')).flush([mockUser]);

    service.logout();
    expect(service.getToken()).toBeNull();
  });
});
