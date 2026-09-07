import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

// AWS: apiBaseUrl is '/api' in production, which CloudFront routes to API
// Gateway -> Lambda (see infra/lib/frontend-stack.ts's '/api/*' behavior) --
// same origin as the SPA, so no CORS is needed there. In local dev,
// apiBaseUrl is the deployed API Gateway's own HTTPS URL (there is no local
// Lambda emulator here), which IS cross-origin from localhost:4200 -- see
// BackendStack's corsPreflight config.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(ConfigService);
  const authService = inject(AuthService);

  if (!req.url.startsWith(config.get().apiBaseUrl)) {
    return next(req);
  }

  const token = authService.accessToken;
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
