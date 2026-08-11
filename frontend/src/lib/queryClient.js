import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A 4xx will fail identically on retry — only retry transport/5xx errors.
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        // Gateway errors are usually a restart or deploy in progress, so retry
        // a little more persistently before giving up on the user's behalf.
        const isGateway = status === 502 || status === 503 || status === 504;
        return failureCount < (isGateway ? 4 : 2);
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});
