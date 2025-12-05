/**
 * @file API Client with Authentication
 * @description Centralized axios instance with auth token handling.
 * All API calls should use this client to ensure proper authentication.
 */

import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
}

/**
 * Create axios instance with auth header interceptor
 */
const api = axios.create({
    baseURL: API_BASE,
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses - redirect to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid, clear storage and redirect
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');

            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
