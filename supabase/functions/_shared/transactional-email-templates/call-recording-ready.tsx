/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  fromNumber?: string
  callTime?: string
  duration?: number
  recordingUrl?: string
  dashboardUrl?: string
}

const CallRecordingReadyEmail = ({
  fromNumber,
  callTime,
  duration,
  recordingUrl,
  dashboardUrl = 'https://ringster.ai/dashboard/recordings',
}: Props) => (
  <Layout preview="Your call recording is ready">
    <Text style={styles.h1}>Recording ready</Text>
    <Text style={styles.text}>
      The recording and transcript for your latest call are now available.
    </Text>
    <div style={{ margin: '20px 0' }}>
      {fromNumber && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>From</span>
          <span style={styles.statValue}>{fromNumber}</span>
        </div>
      )}
      {callTime && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>When</span>
          <span style={styles.statValue}>{callTime}</span>
        </div>
      )}
      {duration !== undefined && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Duration</span>
          <span style={styles.statValue}>{Math.round(duration)}s</span>
        </div>
      )}
    </div>
    <Text style={styles.text}>
      <Button href={recordingUrl || dashboardUrl} style={styles.button}>
        Listen to recording
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: CallRecordingReadyEmail,
  subject: 'Your call recording is ready',
  displayName: 'Call recording ready',
  previewData: {
    fromNumber: '+1 415 555 0142',
    callTime: 'Today at 2:34 PM',
    duration: 132,
  },
} satisfies TemplateEntry
