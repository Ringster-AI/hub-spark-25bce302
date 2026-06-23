/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  bookingTitle?: string
  startTime?: string
  timezone?: string
  location?: string
  hoursUntil?: number
}

const BookingReminderEmail = ({
  name,
  bookingTitle = 'Your appointment',
  startTime,
  timezone,
  location,
  hoursUntil = 24,
}: Props) => (
  <Layout preview={`Reminder: ${bookingTitle} in ~${hoursUntil}h`}>
    <Text style={styles.h1}>Reminder: {bookingTitle}</Text>
    <Text style={styles.text}>
      {name ? `Hi ${name},` : 'Hi,'} this is a friendly reminder that your appointment is coming up
      in about {hoursUntil} hours.
    </Text>
    <div style={{ margin: '20px 0' }}>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Event</span>
        <span style={styles.statValue}>{bookingTitle}</span>
      </div>
      {startTime && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Starts</span>
          <span style={styles.statValue}>{startTime}{timezone ? ` (${timezone})` : ''}</span>
        </div>
      )}
      {location && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Where</span>
          <span style={styles.statValue}>{location}</span>
        </div>
      )}
    </div>
    <Text style={styles.muted}>
      Need to reschedule? Just reply to this email and we'll sort it out.
    </Text>
  </Layout>
)

export const template = {
  component: BookingReminderEmail,
  subject: (data: Props) => `Reminder: ${data.bookingTitle ?? 'your appointment'} tomorrow`,
  displayName: 'Booking reminder',
  previewData: {
    name: 'Alex',
    bookingTitle: 'Consultation',
    startTime: 'Tue, Jun 10 · 2:00 PM',
    timezone: 'ET',
    hoursUntil: 24,
  },
} satisfies TemplateEntry
