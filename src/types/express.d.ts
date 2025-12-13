/**
 * Express type augmentations
 * Extends Express Request interface to include custom properties
 */

import { User } from '@domain/entities/User';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user information
       * Set by authentication middleware after validating JWT token
       */
      user?: {
        id: string;
        email: string;
        role: 'user' | 'admin' | 'service';
        organizationId?: string;
      };

      /**
       * Correlation ID for request tracing
       * Set by correlation middleware
       */
      correlationId?: string;

      /**
       * Start time of request processing
       * Used for calculating request duration metrics
       */
      startTime?: number;
    }
  }
}

export { };
