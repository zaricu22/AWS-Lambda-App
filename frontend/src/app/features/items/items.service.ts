import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../core/config.service';
import { Item } from './item.model';

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private http = inject(HttpClient);
  private config = inject(ConfigService);

  getItems(): Observable<Item[]> {
    /**
     * AWS: fetches items from the Lambda's GET /api/items through CloudFront -> API Gateway -> Lambda in production; 
     * authInterceptor attaches the Cognito bearer token, and API Gateway's HttpUserPoolAuthorizer validates it before the Lambda ever runs.
     */
    return this.http.get<Item[]>(`${this.config.get().apiBaseUrl}/items`);
  }
}
