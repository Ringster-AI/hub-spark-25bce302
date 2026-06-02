/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  fromNumber?: string
  duration?: number
  recordingUrl?: string
  dashboardUrl?: string
}

const FirstCallCelebrationEmail = ({
  name,
  fromNumber,
  duration,
  recordingUrl,
  dashboardUrl = 'https://ringster.ai/dashboard/recordings',
}: Props) => (
  <Layout preview="🎉 Your AI receptionist just took its first call!">
    <Text style={styles.h1}>
      {name ? `${name}, your first call is in 🎉` : 'Your first call is in 🎉'}
    </Text>
    <Text style={styles.text}>
      Your AI receptionist just handled its first real call. This is a big moment —
      from now on, every ring is covered.
    </Text>
    {(fromNumber || duration) && (
      <Text style={styles.text}>
        {fromNumber && (
          <>
            <strong>From:</strong> {fromNumber}
            <br />
          </>
        )}
        {duration && (
          <>
            <strong>Duration:</strong> {Math.round(duration)}s
          </>
        )}
      </Text>
    )}
    <Text style={styles.text}>
      <Button href={recordingUrl || dashboardUrl} style={styles.button}>
        Listen to the recording
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: FirstCallCelebrationEmail,
  subject: '🎉 Your AI receptionist just took its first call',
  displayName: 'First call celebration',
  previewData: { name: 'Alex', fromNumber: '+1 415 555 0142', duration: 84 },
} satisfies TemplateEntry
