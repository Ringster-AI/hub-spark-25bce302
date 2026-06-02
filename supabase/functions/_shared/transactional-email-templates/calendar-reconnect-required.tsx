/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Button, Layout, Text, styles } from './_brand.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  provider?: string
  reconnectUrl?: string
}

const CalendarReconnectRequiredEmail = ({
  name,
  provider = 'calendar',
  reconnectUrl = 'https://ringster.ai/dashboard/settings',
}: Props) => (
  <Layout preview="Action required: reconnect your calendar">
    <Text style={styles.h1}>Reconnect your {provider}</Text>
    <Text style={styles.text}>
      {name ? `Hi ${name},` : 'Hi,'} your calendar connection has expired or
      been revoked. Your AI agent can't book new appointments until you
      reconnect it.
    </Text>
    <Text style={styles.text}>
      <Button href={reconnectUrl} style={styles.button}>
        Reconnect calendar
      </Button>
    </Text>
    <Text style={styles.muted}>
      Open Settings → Integrations to restore booking in less than a minute.
    </Text>
  </Layout>
)

export const template = {
  component: CalendarReconnectRequiredEmail,
  subject: 'Action required: reconnect your calendar',
  displayName: 'Calendar reconnect required',
  previewData: { name: 'Jane', provider: 'Google Calendar' },
} satisfies TemplateEntry<Props>
