/// <reference types="npm:@types/react@18.3.1" />

import type * as React from 'npm:react@18.3.1'
import { HelloTemplate } from './hello.tsx'

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

export const TEMPLATES: Record<string, TemplateEntry<any>> = {
  hello: {
    component: HelloTemplate,
    subject: 'Hello from Ringster',
    displayName: 'Hello (placeholder)',
    previewData: { name: 'there' },
  },
}
