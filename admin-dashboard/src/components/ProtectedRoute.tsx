import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface AdminUser {
  id: string;
  username: string;
  email?: string;
  display_name?: string;
  role: string;
}

interface ProtectedRouteProps {
  children: ReactNode;
  authEnabled: boolean;
  isAuthenticated: boolean;
}

export default function ProtectedRoute({ 
  children, 
  authEnabled, 
  isAuthenticated 
}: ProtectedRouteProps) {
  const location = useLocation();

  // If auth is disabled, allow access
  if (!authEnabled) {
    return <>{children}</>;
  }

  // If auth is enabled but not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated, render children
  return <>{children}</>;
}

/**
 * Hook to check auth status
 */
export function useAuthStatus() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    try {
      // Check if auth is enabled on server
      const statusRes = await axios.get(`${API_BASE}/v1/auth/status`);
      const enabled = statusRes.data.authEnabled;
      setAuthEnabled(enabled);

      if (!enabled) {
        // Auth disabled, no login needed
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }

      // Auth enabled, check for stored token
      const token = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      // Verify token is still valid
      try {
        const verifyRes = await axios.post(`${API_BASE}/v1/auth/verify`, { token });
        if (verifyRes.data.valid) {
          setIsAuthenticated(true);
          setUser(verifyRes.data.user || (storedUser ? JSON.parse(storedUser) : null));
        } else {
          // Token invalid, clear storage
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          setIsAuthenticated(false);
        }
      } catch {
        // Token verification failed
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      // Assume auth is disabled if server is unreachable
      setAuthEnabled(false);
      setIsAuthenticated(true);
    } finally {
      setLoading(false);
    }
  }

  function login(token: string, userData: AdminUser) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setIsAuthenticated(false);
    setUser(null);
  }

  return {
    authEnabled,
    isAuthenticated,
    user,
    loading,
    login,
    logout,
    checkAuthStatus,
  };
}

/**
 * Get auth token for API calls
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Create axios instance with auth header
 */
export function createAuthAxios() {
  const instance = axios.create({
    baseURL: API_BASE,
  });

  instance.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Token expired or invalid, clear storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        // Optionally redirect to login
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return instance;
}
