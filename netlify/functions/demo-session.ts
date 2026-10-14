import process from 'node:process';
import type { Handler } from '@netlify/functions';
import { demoRuntime } from './services/demo/runtime';
import { demoSessionHandler } from './services/demo/handlers';
import { json, demoErrorResponse } from './services/demo/http';

export const handler: Handler = async event => {
  if (process.env.RINGSTER_DEMO_ENABLED !== 'true') return json(404, { error: 'not_available' });
  try { return await demoSessionHandler({ enabled: true, ...demoRuntime() })(event); }
  catch (error) { return demoErrorResponse(error); }
};
