/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

export interface TemplateRenderProps<TData = Record<string, unknown>> {
  recipient: string
  templateData: TData
}

export interface TemplateEntry<TData = Record<string, unknown>> {
  component: React.ComponentType<TemplateRenderProps<TData>>
  subject: string | ((data: TData) => string)
  displayName?: string
  previewData?: TData
  to?: (data: TData) => string
}

// Placeholder template so the registry is non-empty and edge functions deploy.
// Add real templates by creating a .tsx file in this folder and registering it below.
const HelloTemplate: React.FC<TemplateRenderProps<{ name?: string }>> = ({
  recipient,
  templateData,
}) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Hello from Ringster</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
      <Container style={{ padding: '20px 25px' }}>
        <Heading style={{ fontSize: '22px', color: '#1a1a1a', margin: '0 0 20px' }}>
          Hi {templateData?.name ?? recipient}
        </Heading>
        <Text style={{ fontSize: '14px', color: '#55575d', lineHeight: '1.5' }}>
          This is a placeholder transactional email from Ringster.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const TEMPLATES: Record<string, TemplateEntry<any>> = {
  hello: {
    component: HelloTemplate,
    subject: 'Hello from Ringster',
    displayName: 'Hello (placeholder)',
    previewData: { name: 'there' },
  },
}
