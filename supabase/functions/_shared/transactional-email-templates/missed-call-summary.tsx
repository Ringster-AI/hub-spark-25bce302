/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  fromNumber?: string
  callTime?: string
  reason?: string
  voicemailTranscript?: string
  dashboardUrl?: string
}

const MissedCallSummaryEmail = ({
  fromNumber,
  callTime,
  reason = 'no answer',
  voicemailTranscript,
  dashboardUrl = 'https://ringster.ai/dashboard/recordings',
}: Props) => (
  <Layout preview={`Missed call from ${fromNumber ?? 'unknown'}`}>
    <Text style={styles.h1}>Missed call</Text>
    <Text style={styles.text}>
      Your AI receptionist couldn't connect this call ({reason}). Here's what we
      captured:
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
    </div>
    {voicemailTranscript && (
      <>
        <Text style={styles.muted}>Voicemail transcript:</Text>
        <Text style={{ ...styles.text, fontStyle: 'italic', borderLeft: '3px solid #5b21f0', paddingLeft: '12px' }}>
          "{voicemailTranscript}"
        </Text>
      </>
    )}
    <Text style={styles.text}>
      <Button href={dashboardUrl} style={styles.button}>
        Open call log
      </Button>
    </Text>
  </Layout>
)

export const template = {
  component: MissedCallSummaryEmail,
  subject: (data: Props) =>
    `Missed call${data.fromNumber ? ` from ${data.fromNumber}` : ''}`,
  displayName: 'Missed call summary',
  previewData: {
    fromNumber: '+1 415 555 0142',
    callTime: 'Today at 2:34 PM',
    reason: 'voicemail',
    voicemailTranscript: 'Hi, this is Sam — wanted to ask about pricing. Call me back.',
  },
} satisfies TemplateEntry
