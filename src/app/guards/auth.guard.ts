import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for the stored session to be restored before deciding — otherwise a
  // hard refresh evaluates the guard while currentUser$ is still null.
  await authService.whenReady();

  if (authService.isLoggedIn()) {
    return true;
  }

  // A UrlTree cancels the current navigation atomically instead of racing a
  // router.navigate() call against the in-flight one.
  return router.createUrlTree(['/login']);
};
