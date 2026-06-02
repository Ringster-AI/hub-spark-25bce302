/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  remainingSteps?: string[]
  dashboardUrl?: string
}

const OnboardingNudgeEmail = ({
  name,
  remainingSteps = [],
  dashboardUrl = 'https://ringster.ai/dashboard/onboarding',
}: Props) => (
  <Layout preview="Finish setting up your AI receptionist">
    <Text style={styles.h1}>
      {name ? `${name}, you're almost there` : "You're almost there"}
    </Text>
    <Text style={styles.text}>
      Your Ringster account is set up but your AI receptionist isn't live yet.
      A few small steps and you'll be answering calls 24/7.
    </Text>
    {remainingSteps.length > 0 && (
      <Text style={styles.text}>
        Still to do:
        <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
          {remainingSteps.map((step) => (
            <li key={step} style={{ color: styles.text.color, marginBottom: '4px' }}>
              {step}
            </li>
          ))}
        </ul>
      </Text>
    )}
    <Text style={styles.text}>
      <Button href={dashboardUrl} style={styles.button}>
        Finish setup
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: OnboardingNudgeEmail,
  subject: 'Finish setting up your AI receptionist',
  displayName: 'Onboarding nudge',
  previewData: { name: 'Alex', remainingSteps: ['Pick a voice', 'Connect your phone number'] },
} satisfies TemplateEntry
