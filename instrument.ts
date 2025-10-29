import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://ac9708bcfa9500823450f4b62eba0db7@o447951.ingest.us.sentry.io/4510141894164480',

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
