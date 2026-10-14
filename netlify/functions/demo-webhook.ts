import process from 'node:process';
import type { Handler } from '@netlify/functions';
import { demoRuntime } from './services/demo/runtime';
import { demoWebhookHandler } from './services/demo/handlers';
import { json, demoErrorResponse } from './services/demo/http';

export const handler: Handler = async event => {
  if (process.env.RINGSTER_DEMO_ENABLED !== 'true') return json(404, { error: 'not_available' });
  try {
    const runtime = demoRuntime();
    return await demoWebhookHandler({ enabled: true, secret: runtime.webhookSecret, ...runtime })(event);
  } catch (error) { return demoErrorResponse(error); }
};
