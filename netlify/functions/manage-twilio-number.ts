
import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from './services/twilio-service'
import { DatabaseService } from './services/database-service'
import { authenticateRequest, verifyAgentOwnership, corsHeaders, unauthorizedResponse, forbiddenResponse } from './utils/auth'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    }
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    }
  }

  // SECURITY: Authenticate the request
  const authResult = await authenticateRequest(event.headers.authorization)
  if (authResult.error || !authResult.user) {
    return unauthorizedResponse(authResult.error || 'Authentication required')
  }

  let purchasedNumber: any = null;
  let twilioService: TwilioService;

  try {
    console.log('Starting Twilio number assignment process')
    
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials are not configured')
    }

    if (!process.env.WEBHOOK_URL || !process.env.SMS_WEBHOOK_URL) {
      throw new Error('WEBHOOK_URL and SMS_WEBHOOK_URL environment variables are required')
    }

    const { agentId, agentType = 'inbound' } = JSON.parse(event.body || '{}')
    
    if (!agentId) {
      throw new Error('Agent ID is required')
    }

    // SECURITY: Verify the authenticated user owns this agent
    const ownershipResult = await verifyAgentOwnership(authResult.user.id, agentId)
    if (!ownershipResult.owned) {
      return forbiddenResponse(ownershipResult.error || 'You do not have permission to modify this agent')
    }

    twilioService = new TwilioService(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
    
    const databaseService = new DatabaseService(supabase)

    // Find and purchase number
    const phoneNumber = await twilioService.findAvailableNumber()
    purchasedNumber = await twilioService.purchaseNumber(
      phoneNumber,
      process.env.WEBHOOK_URL,
      process.env.SMS_WEBHOOK_URL
    )

    // Update agent in database first
    await databaseService.updateAgentWithPhoneNumber(
      agentId,
      purchasedNumber.phoneNumber,
      purchasedNumber.sid
    )

    console.log('Successfully updated agent with phone number')

    // Only create Vapi assistant for inbound agents
    if (agentType === 'inbound') {
      {
        const vapiResponse = await fetch(`${event.rawUrl.split('/.netlify')[0]}/.netlify/functions/manage-vapi-assistant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Forward the auth header to the internal call
            'Authorization': event.headers.authorization || ''
          },
          body: JSON.stringify({
            agentId,
            phoneNumber: purchasedNumber.phoneNumber
          })
        })

        if (!vapiResponse.ok) {
          const vapiError = await vapiResponse.text()
          // If Vapi update fails, we need to clean up the database entry
          await databaseService.updateAgentWithPhoneNumber(agentId, null, null)
          // Then release the number
          if (purchasedNumber) {
            await twilioService.releaseNumber(purchasedNumber.sid)
          }
          throw new Error(`Failed to update Vapi assistant: ${vapiError}`)
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        phoneNumber: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid
      })
    }
  } catch (error: any) {
    console.error('Error in manage-twilio-number:', error)
    
    // Only release the number if we haven't updated the database yet
    if (purchasedNumber && !error.message.includes('Failed to update Vapi assistant')) {
      try {
        await twilioService!.releaseNumber(purchasedNumber.sid)
      } catch (releaseError) {
        console.error('Error releasing Twilio number:', releaseError)
      }
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error.message,
        details: error.code ? `Twilio Error Code: ${error.code}` : undefined
      })
    }
  }
}
