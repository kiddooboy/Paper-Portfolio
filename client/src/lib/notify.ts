import toast from 'react-hot-toast';

// Single source of truth for user-facing toast notifications across the app.
// Replaces ad-hoc alert() / silent .catch(() => {}) calls.

export const notify = {
  success: (msg: string) => toast.success(msg, { duration: 3000 }),
  error:   (msg: string) => toast.error(msg, { duration: 4500 }),
  info:    (msg: string) => toast(msg, { duration: 3000 }),
  loading: (msg: string) => toast.loading(msg),
  dismiss: (id?: string) => (id ? toast.dismiss(id) : toast.dismiss()),

  /** Surface an axios / unknown error as a friendly toast. */
  fromError(err: any, fallback = 'Something went wrong'): void {
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      fallback;
    toast.error(String(msg), { duration: 4500 });
  },
};

export default notify;
