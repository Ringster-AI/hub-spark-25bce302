/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  daysLeft?: number
  upgradeUrl?: string
}

const TrialEndingEmail = ({
  name,
  daysLeft = 3,
  upgradeUrl = 'https://ringster.ai/dashboard/subscription',
}: Props) => (
  <Layout preview={`Your Ringster trial ends in ${daysLeft} days`}>
    <Text style={styles.h1}>
      {name
        ? `${name}, your trial ends in ${daysLeft} days`
        : `Your trial ends in ${daysLeft} days`}
    </Text>
    <Text style={styles.text}>
      Pick a plan to keep your AI receptionist answering calls without
      interruption. Your settings, agents, and call history stay exactly as they are.
    </Text>
    <Text style={styles.text}>
      <Button href={upgradeUrl} style={styles.button}>
        Choose a plan
      </Button>
    </Text>
    <Text style={styles.muted}>
      Questions? Just reply — we'll help you pick the right one.
    </Text>
  </Layout>
)

export const template = {
  component: TrialEndingEmail,
  subject: (data: Props) => `Your Ringster trial ends in ${data.daysLeft ?? 3} days`,
  displayName: 'Trial ending',
  previewData: { name: 'Alex', daysLeft: 3 },
} satisfies TemplateEntry
