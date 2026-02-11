/**
 * Hook for making authenticated API requests with automatic token refresh
 *
 * Features:
 * - Automatically adds Authorization header with access token
 * - Detects 401 errors and attempts to refresh token
 * - Retries failed request once with new token
 * - Handles both JSON and FormData requests
 *
 * @author HuntZen Team
 * @date 2026-02-04
 */

'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { tokenRefreshService } from '@/lib/auth/token-refresh-service';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean; // Skip adding Authorization header (for public endpoints)
}

export function useAuthenticatedFetch() {
  const { session } = useAuth();

  /**
   * Make an authenticated fetch request with automatic 401 handling
   */
  const authenticatedFetch = useCallback(
    async (url: string, options: FetchOptions = {}): Promise<Response> => {
      const { skipAuth, ...fetchOptions } = options;

      // Build headers
      const headers: Record<string, string> = {};

      // Add Authorization header if session exists and not skipped
      if (!skipAuth && session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Preserve existing headers
      if (options.headers) {
        Object.assign(headers, options.headers);
      }

      // First attempt
      let response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // Handle 401 - Token expired, use centralized refresh service
      if (response.status === 401 && !skipAuth) {
        console.warn('[AuthenticatedFetch] Token expired (401), getting new token...');

        const newToken = await tokenRefreshService.getValidToken();

        if (!newToken) {
          // Service has already handled logout/redirect
          throw new Error('Session expirée - veuillez vous reconnecter');
        }

        console.log('[AuthenticatedFetch] Got new token, retrying request...');

        // Retry with new token
        const retryResponse = await fetch(url, {
          ...fetchOptions,
          headers: {
            ...headers,
            Authorization: `Bearer ${newToken}`,
          },
        });

        // If still 401 after refresh, session is invalid
        if (retryResponse.status === 401) {
          console.error('[AuthenticatedFetch] Still 401 after token refresh - session invalid');
          throw new Error('Session invalide - veuillez vous reconnecter');
        }

        return retryResponse;
      }

      return response;
    },
    [session]
  );

  /**
   * Convenience method for JSON requests
   */
  const fetchJSON = useCallback(
    async <T = any>(url: string, options: FetchOptions = {}): Promise<T> => {
      const response = await authenticatedFetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    [authenticatedFetch]
  );

  /**
   * Convenience method for FormData requests (file uploads)
   */
  const fetchFormData = useCallback(
    async <T = any>(url: string, formData: FormData, options: FetchOptions = {}): Promise<T> => {
      const response = await authenticatedFetch(url, {
        ...options,
        method: 'POST',
        body: formData,
        // Don't set Content-Type for FormData - browser will set it with boundary
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    [authenticatedFetch]
  );

  return {
    authenticatedFetch,
    fetchJSON,
    fetchFormData,
  };
}
