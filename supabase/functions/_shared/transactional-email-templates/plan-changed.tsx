/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  previousPlan?: string
  newPlan?: string
  effectiveDate?: string
  dashboardUrl?: string
}

const PlanChangedEmail = ({
  name,
  previousPlan,
  newPlan,
  effectiveDate,
  dashboardUrl = 'https://ringster.ai/dashboard/subscription',
}: Props) => (
  <Layout preview={`You're now on the ${newPlan ?? 'new'} plan`}>
    <Text style={styles.h1}>Your plan has been updated</Text>
    <Text style={styles.text}>
      {name ? `Hi ${name},` : 'Hi,'} this confirms your subscription change.
    </Text>
    <div style={{ margin: '20px 0' }}>
      {previousPlan && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Previous plan</span>
          <span style={styles.statValue}>{previousPlan}</span>
        </div>
      )}
      {newPlan && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>New plan</span>
          <span style={styles.statValue}>{newPlan}</span>
        </div>
      )}
      {effectiveDate && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Effective</span>
          <span style={styles.statValue}>{effectiveDate}</span>
        </div>
      )}
    </div>
    <Text style={styles.text}>
      <Button href={dashboardUrl} style={styles.button}>
        Manage subscription
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: PlanChangedEmail,
  subject: (data: Props) =>
    data.newPlan ? `You're now on the ${data.newPlan} plan` : 'Your plan has been updated',
  displayName: 'Plan changed',
  previewData: { name: 'Alex', previousPlan: 'Starter', newPlan: 'Pro', effectiveDate: 'June 2, 2026' },
} satisfies TemplateEntry
