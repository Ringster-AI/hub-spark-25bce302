/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  bookingTitle?: string
  startTime?: string
  endTime?: string
  timezone?: string
  location?: string
  notes?: string
}

const BookingConfirmationEmail = ({
  name,
  bookingTitle = 'Your booking',
  startTime,
  endTime,
  timezone,
  location,
  notes,
}: Props) => (
  <Layout preview={`Confirmed: ${bookingTitle}`}>
    <Text style={styles.h1}>Booking confirmed ✓</Text>
    <Text style={styles.text}>
      {name ? `Hi ${name},` : 'Hi,'} your booking is on the calendar. Here are the details:
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
      {endTime && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Ends</span>
          <span style={styles.statValue}>{endTime}</span>
        </div>
      )}
      {location && (
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Where</span>
          <span style={styles.statValue}>{location}</span>
        </div>
      )}
    </div>
    {notes && <Text style={styles.muted}>Notes: {notes}</Text>}
  </Layout>
)

export const template = {
  component: BookingConfirmationEmail,
  subject: (data: Props) => `Confirmed: ${data.bookingTitle ?? 'your booking'}`,
  displayName: 'Booking confirmation',
  previewData: {
    name: 'Alex',
    bookingTitle: 'Consultation with Dr. Smith',
    startTime: 'Mon, Jun 9 · 2:00 PM',
    endTime: 'Mon, Jun 9 · 2:30 PM',
    timezone: 'PT',
    location: 'Zoom',
  },
} satisfies TemplateEntry
