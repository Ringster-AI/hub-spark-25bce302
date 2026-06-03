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

interface SignupEmailProps {
  siteName: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} verification code: {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Welcome to {siteName}! Enter this 6-digit code to verify your email
          and finish creating your account. The code expires in 10 minutes.
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{token}</Text>
        </Section>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
