import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
}

interface ValidationResult {
  id: string;
  phoneNumber: string;
  isValid: boolean;
  format: string;
  carrier?: string;
  lineType?: string;
  error?: string;
}

const MAX_BATCH_SIZE = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: require an authenticated user. Twilio Lookup is billable, so we
  // never want unauthenticated callers (just the public anon key) hitting it.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { phoneNumbers } = await req.json() as { phoneNumbers: PhoneNumber[] };

    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone numbers array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (phoneNumbers.length > MAX_BATCH_SIZE) {
      return new Response(
        JSON.stringify({ error: `Too many phone numbers. Max ${MAX_BATCH_SIZE} per request.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating phone numbers:', phoneNumbers.length);


    // Validate phone numbers using built-in logic and external service if available
    const results: ValidationResult[] = await Promise.all(
      phoneNumbers.map(async (item) => {
        try {
          const validation = await validatePhoneNumber(item.phoneNumber);
          return {
            id: item.id,
            phoneNumber: item.phoneNumber,
            ...validation
          };
        } catch (error) {
          console.error(`Error validating ${item.phoneNumber}:`, error);
          return {
            id: item.id,
            phoneNumber: item.phoneNumber,
            isValid: false,
            format: '',
            error: 'Validation failed'
          };
        }
      })
    );

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Phone validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function validatePhoneNumber(phoneNumber: string): Promise<Omit<ValidationResult, 'id' | 'phoneNumber'>> {
  // Clean the phone number
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Basic validation rules
  if (cleaned.length < 10) {
    return {
      isValid: false,
      format: phoneNumber,
      error: 'Phone number too short'
    };
  }
  
  if (cleaned.length > 15) {
    return {
      isValid: false,
      format: phoneNumber,
      error: 'Phone number too long'
    };
  }

  // US phone number validation
  let formatted = cleaned;
  let isValid = true;
  let lineType = 'unknown';

  if (cleaned.length === 10) {
    // US number without country code
    formatted = `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // US number with country code
    formatted = `+${cleaned}`;
  } else if (cleaned.length === 11) {
    // International number
    formatted = `+${cleaned}`;
  } else {
    // Other international formats
    formatted = `+${cleaned}`;
  }

  // Basic US number pattern check
  if (formatted.startsWith('+1')) {
    const usNumber = formatted.substring(2);
    const areaCode = usNumber.substring(0, 3);
    const exchange = usNumber.substring(3, 6);
    
    // Check for invalid patterns
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      isValid = false;
    }
    if (exchange.startsWith('0') || exchange.startsWith('1')) {
      isValid = false;
    }
    
    // Check for common invalid numbers
    const invalidPatterns = [
      /^(\d)\1{9}$/, // All same digits
      /^1234567890$/, // Sequential
      /^0000000000$/, // All zeros
    ];
    
    if (invalidPatterns.some(pattern => pattern.test(usNumber))) {
      isValid = false;
    }

    // Determine line type based on area code patterns
    const mobileAreaCodes = ['201', '202', '203', '205', '206']; // Sample mobile area codes
    if (mobileAreaCodes.includes(areaCode)) {
      lineType = 'mobile';
    } else {
      lineType = 'landline';
    }
  }

  // Try Twilio Lookup API if available
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  
  if (twilioAccountSid && twilioAuthToken && isValid) {
    try {
      const lookupResult = await validateWithTwilio(formatted, twilioAccountSid, twilioAuthToken);
      if (lookupResult) {
        return lookupResult;
      }
    } catch (error) {
      console.log('Twilio lookup failed, using basic validation:', error.message);
    }
  }

  return {
    isValid,
    format: formatPhoneNumber(formatted),
    lineType,
    carrier: 'Unknown'
  };
}

async function validateWithTwilio(phoneNumber: string, accountSid: string, authToken: string) {
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}?Fields=line_type_intelligence,carrier`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        isValid: false,
        format: phoneNumber,
        error: 'Invalid phone number'
      };
    }
    throw new Error(`Twilio API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    isValid: data.valid,
    format: data.phone_number || phoneNumber,
    carrier: data.carrier?.name || 'Unknown',
    lineType: data.line_type_intelligence?.type || 'unknown'
  };
}

function formatPhoneNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    const number = cleaned.substring(1);
    return `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
  }
  
  if (cleaned.length === 10) {
    return `+1 (${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  
  return phoneNumber;
}
