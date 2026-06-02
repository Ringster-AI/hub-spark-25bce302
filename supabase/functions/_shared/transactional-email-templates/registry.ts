/// <reference types="npm:@types/react@18.3.1" />

import type * as React from 'npm:react@18.3.1'

export interface TemplateEntry<TData = Record<string, unknown>> {
  component: React.ComponentType<TData>
  subject: string | ((data: TData) => string)
  displayName?: string
  previewData?: TData
  to?: string | ((data: TData) => string)
}

import { template as welcome } from './welcome.tsx'
import { template as onboardingNudge } from './onboarding-nudge.tsx'
import { template as firstCallCelebration } from './first-call-celebration.tsx'
import { template as trialEnding } from './trial-ending.tsx'
import { template as bookingConfirmation } from './booking-confirmation.tsx'
import { template as missedCallSummary } from './missed-call-summary.tsx'
import { template as callRecordingReady } from './call-recording-ready.tsx'
import { template as lowCreditWarning } from './low-credit-warning.tsx'
import { template as planChanged } from './plan-changed.tsx'
import { template as paymentFailed } from './payment-failed.tsx'

export const TEMPLATES: Record<string, TemplateEntry<any>> = {
  'welcome': welcome,
  'onboarding-nudge': onboardingNudge,
  'first-call-celebration': firstCallCelebration,
  'trial-ending': trialEnding,
  'booking-confirmation': bookingConfirmation,
  'missed-call-summary': missedCallSummary,
  'call-recording-ready': callRecordingReady,
  'low-credit-warning': lowCreditWarning,
  'plan-changed': planChanged,
  'payment-failed': paymentFailed,
}
