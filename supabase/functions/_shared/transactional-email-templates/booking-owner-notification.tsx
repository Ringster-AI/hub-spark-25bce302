/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  ownerName?: string
  agentName?: string
  attendeeName?: string
  attendeePhone?: string
  attendeeEmail?: string
  appointmentType?: string
  startTime?: string
  timezone?: string
  durationMinutes?: number
  callSummary?: string
  callRecordingUrl?: string
  bookingsUrl?: string
}

const BookingOwnerNotificationEmail = ({
  ownerName,
  agentName,
  attendeeName,
  attendeePhone,
  attendeeEmail,
  appointmentType = 'Appointment',
  startTime,
  timezone,
  durationMinutes,
  callSummary,
  callRecordingUrl,
  bookingsUrl = 'https://ringster.ai/dashboard/calendar',
}: Props) => (
  <Layout preview={`New booking: ${attendeeName ?? 'a caller'} — ${appointmentType}`}>
    <Text style={styles.h1}>New booking</Text>
    <Text style={styles.text}>
      {ownerName ? `Hi ${ownerName},` : 'Hi,'} your AI agent
      {agentName ? ` "${agentName}"` : ''} just booked an appointment.
    </Text>
    <div style={{ margin: '20px 0' }}>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Caller</span>
        <span style={styles.statValue}>{attendeeName || 'Unknown'}</span>
      </div>
      {attendeePhone && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Phone</span>
          <span style={styles.statValue}>{attendeePhone}</span>
        </div>
      )}
      {attendeeEmail && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Email</span>
          <span style={styles.statValue}>{attendeeEmail}</span>
        </div>
      )}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Reason</span>
        <span style={styles.statValue}>{appointmentType}</span>
      </div>
      {startTime && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>When</span>
          <span style={styles.statValue}>{startTime}{timezone ? ` (${timezone})` : ''}</span>
        </div>
      )}
      {durationMinutes && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Duration</span>
          <span style={styles.statValue}>{durationMinutes} min</span>
        </div>
      )}
    </div>
    {callSummary && (
      <>
        <Text style={{ ...styles.text, fontWeight: 600 }}>Call summary</Text>
        <Text style={styles.text}>{callSummary}</Text>
      </>
    )}
    {callRecordingUrl && (
      <Text style={styles.muted}>Call recording &amp; transcript: {callRecordingUrl}</Text>
    )}
    <Text style={styles.muted}>View in Ringster: {bookingsUrl}</Text>
  </Layout>
)

export const template = {
  component: BookingOwnerNotificationEmail,
  subject: (data: Props) =>
    `New booking: ${data.attendeeName ?? 'a caller'}${data.startTime ? ` — ${data.startTime}` : ''}`,
  displayName: 'Booking owner notification',
  previewData: {
    ownerName: 'Alex',
    agentName: 'Receptionist',
    attendeeName: 'Jamie Doe',
    attendeePhone: '+16475551234',
    attendeeEmail: 'jamie@example.com',
    appointmentType: 'Consultation',
    startTime: 'Mon, Jun 9 · 2:00 PM',
    timezone: 'ET',
    durationMinutes: 30,
    callSummary: 'Caller wants a quote on a kitchen remodel; mentioned a budget of around $20k and prefers afternoons.',
    callRecordingUrl: 'https://ringster.ai/dashboard/recordings/abc',
  },
} satisfies TemplateEntry
