/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  amount?: string
  retryDate?: string
  updatePaymentUrl?: string
}

const PaymentFailedEmail = ({
  name,
  amount,
  retryDate,
  updatePaymentUrl = 'https://ringster.ai/dashboard/subscription',
}: Props) => (
  <Layout preview="Action needed: your last Ringster payment failed">
    <Text style={styles.h1}>Your payment didn't go through</Text>
    <Text style={styles.text}>
      {name ? `Hi ${name},` : 'Hi,'} we couldn't process your most recent Ringster
      payment{amount ? ` of ${amount}` : ''}. Your service is still active for now —
      please update your payment method to avoid interruption.
    </Text>
    {retryDate && (
      <Text style={styles.muted}>
        We'll automatically retry on <strong>{retryDate}</strong>.
      </Text>
    )}
    <Text style={styles.text}>
      <Button href={updatePaymentUrl} style={styles.button}>
        Update payment method
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: PaymentFailedEmail,
  subject: 'Action needed: your Ringster payment failed',
  displayName: 'Payment failed',
  previewData: { name: 'Alex', amount: '$49.00', retryDate: 'June 5, 2026' },
} satisfies TemplateEntry
