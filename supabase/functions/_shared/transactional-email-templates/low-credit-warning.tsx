/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  creditsRemaining?: number
  planName?: string
  upgradeUrl?: string
}

const LowCreditWarningEmail = ({
  name,
  creditsRemaining,
  planName,
  upgradeUrl = 'https://ringster.ai/dashboard/subscription',
}: Props) => (
  <Layout preview="Your Ringster credits are running low">
    <Text style={styles.h1}>
      {name ? `${name}, your credits are running low` : 'Your credits are running low'}
    </Text>
    <Text style={styles.text}>
      You have <strong>{creditsRemaining ?? 0} credits</strong> left
      {planName ? ` on your ${planName} plan` : ''}. When credits hit zero, your AI
      receptionist will stop answering calls until you top up.
    </Text>
    <Text style={styles.text}>
      <Button href={upgradeUrl} style={styles.button}>
        Top up credits
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: LowCreditWarningEmail,
  subject: 'Your Ringster credits are running low',
  displayName: 'Low credit warning',
  previewData: { name: 'Alex', creditsRemaining: 12, planName: 'Starter' },
} satisfies TemplateEntry
