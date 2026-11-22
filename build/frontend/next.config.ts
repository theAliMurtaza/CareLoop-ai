import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Optional for development environments that restrict subprocess creation.
  ...(process.env.CARELOOP_WORKER_THREADS === 'true' ? {experimental: {workerThreads: true, cpus: 2, useTypeScriptCli: false}} : {}),
};
export default withNextIntl(config);
