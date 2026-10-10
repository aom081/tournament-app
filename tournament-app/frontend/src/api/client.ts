import axios from 'axios';

/**
 * API Client configuration
 *
 * The baseURL is set to '/api', which leverages the Vite proxy
 * configured in vite.config.ts to forward requests to the backend
 * running at http://localhost:4000.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for centralized error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.message
      || error.response?.data?.message
      || error.message
      || 'An unexpected error occurred';

    console.error(`[API Error] ${error.config?.url}: ${message}`);

    // You can add global error notifications (e.g., via toast) here

    return Promise.reject(error);
  }
);

export default apiClient;
