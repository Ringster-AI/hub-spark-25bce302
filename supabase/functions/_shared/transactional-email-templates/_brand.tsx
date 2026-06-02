/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

export const BRAND = {
  name: 'Ringster',
  url: 'https://ringster.ai',
  primary: '#5b21f0',
  primaryGlow: '#7c3aed',
  primaryFg: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#ffffff',
  radius: '12px',
  font:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
}

export const styles = {
  main: { backgroundColor: BRAND.bg, fontFamily: BRAND.font, margin: 0, padding: 0 },
  container: { padding: '32px 24px', maxWidth: '560px' },
  header: { textAlign: 'left' as const, padding: '0 0 24px' },
  brandText: {
    fontSize: '20px',
    fontWeight: 700 as const,
    color: BRAND.primary,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  card: {
    border: `1px solid ${BRAND.border}`,
    borderRadius: BRAND.radius,
    padding: '32px 28px',
    background: '#ffffff',
  },
  h1: {
    fontSize: '24px',
    fontWeight: 700 as const,
    color: BRAND.text,
    margin: '0 0 16px',
    lineHeight: 1.25,
    letterSpacing: '-0.02em',
  },
  text: {
    fontSize: '15px',
    color: BRAND.text,
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
  muted: {
    fontSize: '13px',
    color: BRAND.muted,
    lineHeight: 1.6,
    margin: '0 0 12px',
  },
  button: {
    backgroundColor: BRAND.primary,
    color: BRAND.primaryFg,
    padding: '12px 22px',
    borderRadius: BRAND.radius,
    fontSize: '15px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    display: 'inline-block',
  },
  hr: { borderColor: BRAND.border, margin: '28px 0' },
  footer: {
    fontSize: '12px',
    color: BRAND.muted,
    lineHeight: 1.6,
    margin: '24px 0 0',
    textAlign: 'center' as const,
  },
  statRow: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    padding: '10px 0',
    borderBottom: `1px solid ${BRAND.border}`,
  },
  statLabel: { fontSize: '13px', color: BRAND.muted, margin: 0 },
  statValue: { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, margin: 0 },
}

interface LayoutProps {
  preview: string
  children: React.ReactNode
}

export const Layout = ({ preview, children }: LayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>Ringster</Text>
        </Section>
        <Section style={styles.card}>{children}</Section>
        <Hr style={styles.hr} />
        <Text style={styles.footer}>
          Ringster — AI receptionists for service businesses
          <br />
          <a href={BRAND.url} style={{ color: BRAND.muted, textDecoration: 'underline' }}>
            ringster.ai
          </a>
        </Text>
      </Container>
    </Body>
  </Html>
)

export { Button, Heading, Hr, Section, Text }
