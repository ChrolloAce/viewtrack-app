import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type JobStatus = 'running' | 'done' | 'error';
export type Job = {
  id: string;
  title: string;
  status: JobStatus;
  done: number;
  total: number;
  note?: string;
  error?: string;
  createdAt: number;
};

/** Passed to a job's runner so it can report progress as it works. */
export type JobCtx = {
  progress: (done: number, total?: number) => void;
  note: (text: string) => void;
};

type JobsValue = {
  jobs: Job[];
  /** Kick off a background job. Returns its id. The runner reports progress via ctx. */
  startJob: (title: string, total: number, run: (ctx: JobCtx) => Promise<void>) => string;
  dismiss: (id: string) => void;
  clearFinished: () => void;
};

const JobsContext = createContext<JobsValue | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const seq = useRef(0);

  const patch = useCallback((id: string, fn: (j: Job) => Job) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? fn(j) : j)));
  }, []);

  const startJob = useCallback(
    (title: string, total: number, run: (ctx: JobCtx) => Promise<void>) => {
      seq.current += 1;
      const id = `job-${seq.current}-${Math.floor(Math.random() * 1e6)}`;
      const job: Job = { id, title, status: 'running', done: 0, total, createdAt: Date.now() };
      setJobs((prev) => [job, ...prev]);

      const ctx: JobCtx = {
        progress: (done, t) => patch(id, (j) => ({ ...j, done, total: t ?? j.total })),
        note: (text) => patch(id, (j) => ({ ...j, note: text })),
      };

      Promise.resolve()
        .then(() => run(ctx))
        .then(() => patch(id, (j) => ({ ...j, status: 'done', done: j.total || j.done })))
        .catch((e) => patch(id, (j) => ({ ...j, status: 'error', error: e instanceof Error ? e.message : String(e) })));

      return id;
    },
    [patch],
  );

  const dismiss = useCallback((id: string) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);
  const clearFinished = useCallback(() => setJobs((prev) => prev.filter((j) => j.status === 'running')), []);

  return <JobsContext.Provider value={{ jobs, startJob, dismiss, clearFinished }}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within a JobsProvider');
  return ctx;
}
