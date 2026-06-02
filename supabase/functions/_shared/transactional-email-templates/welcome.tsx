/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  dashboardUrl?: string
}

const WelcomeEmail = ({ name, dashboardUrl = 'https://ringster.ai/dashboard' }: Props) => (
  <Layout preview="Welcome to Ringster — let's set up your first AI receptionist">
    <Text style={styles.h1}>
      {name ? `Welcome, ${name}!` : 'Welcome to Ringster!'}
    </Text>
    <Text style={styles.text}>
      You're three steps away from never missing another call. Set up your first
      AI receptionist in under 5 minutes — choose a voice, connect your number,
      and you're live.
    </Text>
    <Text style={styles.text}>
      <Button href={dashboardUrl} style={styles.button}>
        Open your dashboard
      </Button>
    </Text>
    <Text style={styles.muted}>
      Reply to this email if you get stuck — a real human reads it.
    </Text>
  </Layout>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to Ringster',
  displayName: 'Welcome',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry
