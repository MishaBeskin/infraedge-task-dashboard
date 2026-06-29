import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  // Returning a UrlTree lets the router cancel the current navigation atomically.
  // Calling router.navigate() here instead would race against the in-flight navigation
  // and could briefly flash the guarded route before the redirect lands.
  return router.createUrlTree(['/login']);
};
