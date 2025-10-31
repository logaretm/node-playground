import * as Sentry from '@sentry/node';
import 'dotenv/config';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Add Tracing by setting tracesSampleRate
  tracesSampleRate: 1.0,

  // Set sampling rate for profiling
  // This is relative to tracesSampleRate
  // profilesSampleRate: 1.0,

  // Add request headers and IP to the Sentry event
  sendDefaultPii: true,

  // Logs
  // enableLogs: true,

  // Add integrations
  // integrations: [
  //   Sentry.pinoIntegration(),
  // ],

  debug: true,
});
