import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

/*
 * AWS: Attaches the Cognito bearer token with every request to the Lambda's API (CloudFront -> API Gateway -> Lambda);
 * API Gateway's HttpUserPoolAuthorizer validates it before the Lambda ever runs.
*/
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
