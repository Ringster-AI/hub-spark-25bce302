/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  token?: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} sign-in code: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your sign-in code</Heading>
        <Text style={text}>
          Enter this 6-digit code to sign in to {siteName}. The code expires in
          10 minutes.
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{token}</Text>
        </Section>
        <Text style={footer}>
          If you didn't request this code, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '480px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const codeBox = {
  background: '#f5f3ff',
  border: '1px solid #ddd6fe',
  borderRadius: '10px',
  padding: '18px 24px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const codeText = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '10px',
  color: '#4f46e5',
  margin: 0,
  fontFamily: 'monospace',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
